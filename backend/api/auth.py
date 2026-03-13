from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Auth"])

class UserCreate(BaseModel):
    user_id: str
    name: str
    email: str

@router.post("/register")
async def register_user(user: UserCreate):
    # This will be integrated with Firestore
    return {"message": "User registered successfully", "user": user}
