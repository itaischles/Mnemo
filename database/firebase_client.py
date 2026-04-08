import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

_db = None


def get_db():
    global _db
    if _db is None:
        if not firebase_admin._apps:
            cred_path = os.environ["FIREBASE_CREDENTIALS_PATH"]
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db
