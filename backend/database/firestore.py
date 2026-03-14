import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
from dotenv import load_dotenv

load_dotenv()

db = None
bucket = None


# Initialize Firebase (Requires serviceAccountKey.json in production)
cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json")

try:
    if not firebase_admin._apps:
        cred_dict = {
            "type": "service_account",
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": os.getenv("FIREBASE_PRIVATE_KEY").replace("\\n", "\n"),
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.getenv("FIREBASE_CLIENT_ID"),
            "auth_uri": os.getenv("FIREBASE_AUTH_URI"),
            "token_uri": os.getenv("FIREBASE_TOKEN_URI"),
            "auth_provider_x509_cert_url": os.getenv("AUTH_PROVIDER_CERT_ID"),
            "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_CERT_ID"),
            "universe_domain": "googleapis.com"
        }
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET", "testify-app.appspot.com")
        })
    db = firestore.client()
    bucket = storage.bucket()
except Exception as e:
    print(f"Firebase not initialized. Ensure service account key exists: {e}")
    db = None
    bucket = None

def get_db():
    return db
