import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Firebase (Requires serviceAccountKey.json in production)
cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json")

try:
    if not firebase_admin._apps:
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
