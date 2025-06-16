import os
import requests
from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import logging

# --- CONFIG ---
PLAYFAB_TITLE_ID = "167991"
PLAYFAB_SECRET_KEY = os.getenv("PLAYFAB_SECRET_KEY")

if not PLAYFAB_TITLE_ID or not PLAYFAB_SECRET_KEY:
    raise Exception("Missing required environment variables: PLAYFAB_TITLE_ID and PLAYFAB_SECRET_KEY")

# --- APP + RATE LIMITING ---
app = Flask(__name__)
limiter = Limiter(app, key_func=get_remote_address, default_limits=["50 per minute"])

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# --- HELPERS ---
def playfab_headers():
    return {
        "content-type": "application/json",
        "X-SecretKey": PLAYFAB_SECRET_KEY
    }

def safe_post(url, json_data):
    try:
        r = requests.post(url, json=json_data, headers=playfab_headers(), timeout=5)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        logger.error(f"Request failed: {e}")
        return None

# --- ROUTES ---
@app.route("/api/authenticate", methods=["POST"])
@limiter.limit("10 per minute")
def authenticate():

     data = request.get_json()
    custom_id = data.get("CustomId")
    timestamp = data.get("Timestamp")
    nonce = data.get("Nonce")
    signature = data.get("Signature")

    # Basic checks
    if not (custom_id and timestamp and nonce and signature):
        return jsonify({"error": "Missing fields"}), 400

    # Timestamp freshness (30 sec window)
    if abs(time.time() - int(timestamp)) > 30:
        return jsonify({"error": "Request too old"}), 400

    # Nonce reuse protection (store + check recent nonces — Redis or memory)
    if nonce in recent_nonces:
        return jsonify({"error": "Nonce reuse detected"}), 400
    recent_nonces.add(nonce)

    if not is_valid_signature(custom_id, timestamp, nonce, signature):
        return jsonify({"error": "Invalid signature"}), 403
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    custom_id = data.get("CustomId")
    app_id = data.get("AppId")
    if not custom_id or not app_id:
        return jsonify({"error": "CustomId and AppId required"}), 400

    if not custom_id.startswith(("OC", "PI")):
        return jsonify({"error": "CustomId must start with OC or PI"}), 400

    if app_id != PLAYFAB_TITLE_ID:
        return jsonify({"error": "AppId mismatch"}), 400

    url = f"https://{PLAYFAB_TITLE_ID}.playfabapi.com/Server/LoginWithServerCustomId"
    response = safe_post(url, {
        "ServerCustomId": custom_id,
        "CreateAccount": True
    })

    if not response:
        return jsonify({"error": "Login failed"}), 500

    data = response.get("data", {})
    session_ticket = data.get("SessionTicket")
    entity_token = data.get("EntityToken", {}).get("EntityToken")
    playfab_id = data.get("PlayFabId")

    return jsonify({
        "PlayFabId": playfab_id,
        "SessionTicket": session_ticket,
        "EntityToken": entity_token
    })

@app.route("/api/titledata", methods=["GET"])
@limiter.limit("5 per minute")
def title_data():
    url = f"https://{PLAYFAB_TITLE_ID}.playfabapi.com/Server/GetTitleData"
    response = safe_post(url, {})
    if not response:
        return jsonify({"error": "Failed to retrieve title data"}), 500
    return jsonify(response.get("data", {}).get("Data", {}))

@app.route("/api/photon", methods=["POST"])
@limiter.limit("10 per minute")
def photon_auth():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    ticket = data.get("Ticket")
    if not ticket or "-" not in ticket:
        return jsonify({"error": "Invalid or missing Ticket"}), 400

    user_id = ticket.split("-")[0]
    if len(user_id) != 16:
        return jsonify({"error": "Invalid user ID length"}), 400

    url = f"https://{PLAYFAB_TITLE_ID}.playfabapi.com/Server/GetUserAccountInfo"
    response = safe_post(url, {"PlayFabId": user_id})

    if not response:
        return jsonify({"error": "Account info retrieval failed"}), 500

    username = response.get("data", {}).get("UserInfo", {}).get("Username")
    return jsonify({
        "resultCode": 1,
        "userId": user_id.upper(),
        "nickname": username
    })

# --- ENTRY ---
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
