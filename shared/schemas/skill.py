from typing import Optional, Literal, Dict, List, Any
from pydantic import BaseModel, Field

class Skill(BaseModel):
    id: str = Field(..., description="Unique identifier for the skill")
    name: str = Field(..., description="Name of the skill")
    description: str = Field(..., description="Description of the skill")
    status: Literal['stub', 'learned'] = Field(..., description="Status of the skill")
    procedure: Optional[List[str]] = Field(None, description="List of steps for the procedure")
    tool_mappings: Optional[Dict[str, Any]] = Field(None, description="Mapping of tools to use")
    evaluation: Optional[Dict[str, Any]] = Field(None, description="Evaluation criteria and results")
    transfer_notes: Optional[str] = Field(None, description="Notes on transfer learning")

class SkillList(BaseModel):
    version: int = Field(..., description="Version of the skill list")
    role: str = Field(..., description="The role this skill list represents")
    prompt: str = Field(..., description="The job prompt used to generate this list")
    skills: List[Skill] = Field(..., description="List of skills")
    metadata: Dict[str, Any] = Field(..., description="Additional metadata")
