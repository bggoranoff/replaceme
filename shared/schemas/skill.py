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


# ---------------------------------------------------------------------------
# skills/<level-id>/skill.json v2 (shared/game_contract.md section e).
# ---------------------------------------------------------------------------

class Evidence(BaseModel):
    attempt: int = Field(..., description="Attempt number 1..10")
    value: Any = Field(..., description="Value or choice tried")
    score: float = Field(..., description="Score that attempt got")


class LearnedParameter(BaseModel):
    variable: str = Field(..., description="Variable id, phase id, item id or turn id")
    label: str = Field(..., description="Human label")
    value: Any = Field(..., description="Learned best value or choice")
    unit: str = Field("", description="Unit, empty for choices")
    rationale: str = Field(..., description="Why, from attempts and sources")
    evidence: List[Evidence] = Field(default_factory=list, description="Values tried and their scores")


class ControlEffect(BaseModel):
    variable: str = Field(..., description="Variable id")
    effect: str = Field(..., description="Observed effect of this control on score/feedback")
    evidence: List[Evidence] = Field(default_factory=list)


class Problem(BaseModel):
    problem: str
    attempt: int
    fix: str


class Attempt(BaseModel):
    attempt: int
    run_id: str
    inputs: Dict[str, Any] = Field(..., description="Control values or choices submitted")
    actions_taken: List[Dict[str, Any]] = Field(..., description="[{action, params}] from shared/actions.json")
    score: float
    passed: bool
    feedback: List[str]
    breakdown: Dict[str, Any] = Field(default_factory=dict)
    problems_found: List[str] = Field(default_factory=list)
    caveats: List[str] = Field(default_factory=list)
    hypothesis: str = Field("", description="What the actor believed before this attempt")
    what_changed: str = Field("", description="What it changed vs the previous attempt and why")


class ScorePoint(BaseModel):
    attempt: int
    score: float
    passed: bool


class UserContext(BaseModel):
    text: str
    added_at: str


class SourceRef(BaseModel):
    title: str = ""
    url: str


class LearnedSkill(BaseModel):
    version: Literal[2] = 2
    id: str = Field(..., description="Equals the level id")
    name: str
    description: str
    job: str
    level_id: str
    level_index: int
    mechanic: Literal["mix", "timing", "sort", "deliver", "converse"]
    status: Literal["learned", "stub"] = "learned"
    trained_attempts: int
    best_score: float
    final_score: float
    pass_threshold: float
    passed: bool
    learned_parameters: List[LearnedParameter]
    control_effects: List[ControlEffect]
    steps: List[str]
    caveats: List[str]
    problems: List[Problem]
    score_history: List[ScorePoint]
    attempts: List[Attempt]
    sources: List[SourceRef]
    user_context: List[UserContext] = Field(default_factory=list)
    updated_at: str
