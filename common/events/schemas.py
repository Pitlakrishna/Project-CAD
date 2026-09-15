from datetime import datetime
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class BaseEvent(BaseModel, Generic[T]):
    event_id: str
    event_type: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tenant_id: Optional[str] = None
    payload: T

class UserRegisteredPayload(BaseModel):
    user_id: str
    email: str
    created_at: datetime

class LlmCodeGeneratedPayload(BaseModel):
    prompt_id: str
    user_id: str
    code_snippet: str
    token_usage: int

class CadExportReadyPayload(BaseModel):
    export_id: str
    model_id: str
    user_id: str
    format: str
    download_url: str
