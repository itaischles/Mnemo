from fastapi import Header, HTTPException, status
from firebase_admin import auth as firebase_auth
from database.firebase_client import get_db  # ensures firebase_admin is initialized


async def get_current_uid(authorization: str = Header(...)) -> str:
    """
    Verify the Firebase ID token from the Authorization: Bearer <token> header.
    Returns the authenticated user's UID on success.
    Raises 401 on any verification failure.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must start with 'Bearer '",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Firebase token: {e}",
        )
