from typing import List, Dict, Any, Literal, Optional, Union
from pydantic import BaseModel, Field

class Theme(BaseModel):
    name: str = Field(..., description="Venue theme name e.g. Artisan Café")
    floorType: str = Field(..., description="Floor style e.g. planks, tiles")
    floorColor1: str = Field(..., description="Primary floor hex color")
    floorColor2: str = Field(..., description="Secondary floor hex color")
    wallColor: str = Field(..., description="Wall hex color")
    wallpaperColor: str = Field(..., description="Wallpaper hex color")
    trimColor: str = Field(..., description="Trim hex color")
    accentColor: str = Field(..., description="Accent hex color")

class Station(BaseModel):
    id: str = Field(..., description="Station slug e.g. station-steamer")
    name: str = Field(..., description="Display name e.g. Steam Wand Station")
    icon: str = Field(..., description="Icon key e.g. steamer, grinder, fridge, register")
    tile: List[int] = Field(..., description="[x, y] tile coordinates in a 20x13 room")
    w: int = Field(..., description="Width in tiles")
    h: int = Field(..., description="Height in tiles")
    color: str = Field(..., description="Body hex color")
    accent: str = Field(..., description="Accent hex color")
    description: str = Field(..., description="What the player does at this station")

class Control(BaseModel):
    id: str = Field(..., description="Control slug e.g. temp_celsius")
    label: str = Field(..., description="Human-readable label")
    type: Literal["slider", "toggle", "choice"] = Field(..., description="Control type")
    default: Union[bool, float, str] = Field(..., description="Default value")
    min: Optional[float] = Field(None, description="Slider minimum")
    max: Optional[float] = Field(None, description="Slider maximum")
    step: Optional[float] = Field(None, description="Slider step")
    unit: Optional[str] = Field(None, description="Slider unit e.g. °C, g")
    targetMin: Optional[float] = Field(None, description="Slider lower bound for success")
    targetMax: Optional[float] = Field(None, description="Slider upper bound for success")
    options: Optional[List[str]] = Field(None, description="Choice options")

class Level(BaseModel):
    id: str = Field(..., description="Level slug e.g. steam-milk")
    level: int = Field(..., description="Level number")
    title: str = Field(..., description="Catchy Title")
    skill_name: str = Field(..., description="Target Skill Name")
    goal: str = Field(..., description="Clear 1-2 sentence goal")
    instruction: str = Field(..., description="Actionable human prompt naming the station to walk to")
    targetStationId: str = Field(..., description="id of the station where the level is completed")
    customerProfiles: List[str] = Field(..., description="Customer profiles")
    initialSupplies: Dict[str, int] = Field(..., description="Initial supplies")
    actions: List[str] = Field(..., description="Available actions")
    controls: List[Control] = Field(..., description="Sliders, toggles, or choices for the human player")
    successConditions: List[str] = Field(..., description="Success conditions")
    steps: List[str] = Field(..., description="Procedural steps")
    checks: List[str] = Field(..., description="Verifiable checks")

class Research(BaseModel):
    version: int = Field(..., description="Schema version, usually 1")
    role: str = Field(..., description="Canonical role slug")
    title: str = Field(..., description="Venue title e.g. Specialty Espresso Bar")
    theme: Theme = Field(..., description="Visual theme of the venue")
    sources: List[str] = Field(..., description="Sources or standard references")
    rules: List[str] = Field(..., description="Core domain rules")
    assumptions: List[str] = Field(..., description="Operational assumptions")
    stations: List[Station] = Field(..., description="Interactive stations in the room")
    levels: List[Level] = Field(..., description="List of progressive levels")


# ---------------------------------------------------------------------------
# research.json v2 (shared/game_contract.md section i). New code uses
# ResearchBrief; Research/Level above are the legacy v1 shape.
# ---------------------------------------------------------------------------

MechanicId = Literal["mix", "timing", "sort", "deliver", "converse"]
Curve = Literal["gaussian", "linear", "step"]


class Source(BaseModel):
    title: str = Field(..., description="Page or document title")
    url: str = Field(..., description="Cited URL from Google Search grounding")


class TaskVariable(BaseModel):
    id: str = Field(..., description="snake_case id usable in expressions")
    label: str = Field(..., description="Human label")
    unit: str = Field(..., description="Unit, e.g. g, ml, s, °C, %")
    min: float = Field(..., description="Control minimum")
    max: float = Field(..., description="Control maximum")
    step: float = Field(..., description="Control step")
    default: float = Field(..., description="Starting value (should not be optimal)")


class Optimum(BaseModel):
    term: str = Field(..., description="Variable id or derived term id")
    target: Optional[float] = Field(None, description="Researched optimal value (or use range)")
    range: Optional[List[float]] = Field(None, description="Researched optimal [lo, hi]")
    rationale: str = Field(..., description="Why this is optimal")
    source_urls: List[str] = Field(..., description="Cited URLs supporting it")


class DerivedTerm(BaseModel):
    id: str = Field(..., description="snake_case id")
    label: str = Field(..., description="Human label of the relation, e.g. a ratio between two variables")
    expr: str = Field(..., description="Arithmetic over variable ids using only + - * / ( ) and numbers")


class HeuristicTerm(BaseModel):
    term: str = Field(..., description="Variable id or derived term id")
    tolerance: float = Field(..., description="Deviation at which quality is clearly degraded")
    weight: float = Field(..., description="Relative importance > 0")
    curve: Curve = Field(..., description="gaussian, linear or step")
    too_low: str = Field(..., description="Qualitative feedback when below optimum, without revealing it")
    too_high: str = Field(..., description="Qualitative feedback when above optimum, without revealing it")
    rationale: str = Field(..., description="Why deviation lowers quality")


class SortItem(BaseModel):
    label: str = Field(..., description="Item to route")
    correct_bin: str = Field(..., description="Label of the correct bin")
    feedback: str = Field(..., description="Feedback when misrouted")


class DeliveryOrder(BaseModel):
    item: str = Field(..., description="What is carried")
    destination: str = Field(..., description="Who or where receives it")
    note: str = Field(..., description="Constraint or caveat")


class DialogueOption(BaseModel):
    text: str = Field(..., description="What the worker says")
    points: float = Field(..., description="0..1 quality of this response")
    feedback: str = Field(..., description="Why this response is good or bad")
    critical: bool = Field(..., description="True if choosing it is a serious error that fails the task")


class DialogueTurn(BaseModel):
    npc_line: str = Field(..., description="What the NPC says")
    options: List[DialogueOption] = Field(..., description="2-4 possible responses")


class ResearchTask(BaseModel):
    id: str = Field(..., description="kebab-case task slug")
    title: str = Field(..., description="Short task title")
    summary: str = Field(..., description="What the worker does in this task")
    mechanic: MechanicId = Field(..., description="Which of the 5 platform mechanics fits best")
    mechanic_rationale: str = Field(..., description="Why this mechanic models the task")
    aim: str = Field(..., description="What to achieve, without revealing the optimal values")
    variables: List[TaskVariable] = Field(..., description="Adjustable variables (mix: inputs; timing: one per phase); empty for sort/deliver/converse")
    derived: List[DerivedTerm] = Field(..., description="Derived relations between variables, e.g. ratios")
    optima: List[Optimum] = Field(..., description="Researched optimal values or ranges per variable/derived term")
    heuristic: List[HeuristicTerm] = Field(..., description="Scoring heuristic: how deviation from each optimum lowers quality")
    sort_items: List[SortItem] = Field(..., description="sort only: items with correct bins; else empty")
    sort_bins: List[str] = Field(..., description="sort only: bin labels; else empty")
    orders: List[DeliveryOrder] = Field(..., description="deliver only: orders; else empty")
    dialogue: List[DialogueTurn] = Field(..., description="converse only: turns; else empty")
    caveats: List[str] = Field(..., description="Caveats a practitioner must know")
    problems: List[str] = Field(..., description="Problems that commonly appear and how they show up")
    sources: List[Source] = Field(..., description="Cited sources for this task")


class ReasoningTrace(BaseModel):
    task_id: Optional[str] = Field(None, description="Task this step reasons about, or null for overall")
    step: int = Field(..., description="Order of the reasoning step")
    thought: str = Field(..., description="Reasoning text")
    evidence: List[str] = Field(..., description="URLs or queries the step relied on")


class BrainRef(BaseModel):
    stored: bool = Field(..., description="True if traces were written to Entire Brain")
    ids: List[str] = Field(default_factory=list, description="Entire Brain item ids")
    query: Optional[str] = Field(None, description="Query that retrieves the traces")


class ResearchBrief(BaseModel):
    version: Literal[2] = Field(2, description="Schema version")
    job: str = Field(..., description="Job exactly as entered by the user")
    slug: str = Field(..., description="kebab-case job slug")
    title: str = Field(..., description="World title")
    setting: str = Field(..., description="Cozy village setting and the places where the job happens")
    sources: List[Source] = Field(..., description="All cited sources")
    rules: List[str] = Field(..., description="Core domain rules")
    assumptions: List[str] = Field(..., description="Operational assumptions")
    tasks: List[ResearchTask] = Field(..., description="At least 4 distinct tasks; the builder uses 4")
    reasoning_traces: List[ReasoningTrace] = Field(default_factory=list, description="Fallback copy of the researcher's reasoning traces")
    brain: Optional[BrainRef] = Field(None, description="Where the traces live in Entire Brain")
