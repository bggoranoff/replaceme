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
