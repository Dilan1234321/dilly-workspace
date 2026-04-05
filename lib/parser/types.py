"""
Dilly Resume Parser - Type definitions for the four-layer architecture.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, TypedDict


@dataclass
class ExtractedField:
    value: Any
    confidence: Literal["high", "medium", "low"]
    strategy: str
    raw: Optional[str] = None
    warning: Optional[str] = None


@dataclass
class ExtractedEducation:
    institution: Optional[str] = None
    degree: Optional[str] = None
    major: Optional[str] = None
    gpa: Optional[str] = None
    graduation_date: Optional[str] = None
    location: Optional[str] = None
    honors: Optional[str] = None


@dataclass
class ExtractedExperience:
    company: Optional[str] = None
    role: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: bool = False
    bullets: List[str] = field(default_factory=list)
    location: Optional[str] = None


@dataclass
class ExtractedSkills:
    technical: List[str] = field(default_factory=list)
    soft: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    all: List[str] = field(default_factory=list)


@dataclass
class ParserWarning:
    field: str
    message: str
    severity: Literal["high", "medium", "low"]


@dataclass
class TextChunk:
    text: str
    x: float
    y: float
    width: float
    height: float
    font_size: float
    font_weight: Literal["normal", "bold"]
    font_name: str
    page: int


@dataclass
class ParsedResume:
    name: ExtractedField
    email: ExtractedField
    phone: ExtractedField
    linkedin: ExtractedField
    location: ExtractedField
    summary: ExtractedField
    education: ExtractedField
    experience: ExtractedField
    skills: ExtractedField
    certifications: ExtractedField
    sections_detected: List[str]
    sections_not_mapped: List[Dict[str, Any]]
    overall_confidence: int
    parser_warnings: List[ParserWarning]
    layout_detected: Literal["single_column", "multi_column", "table_heavy", "mixed"]
    parse_time_ms: int
    # Legacy-compat: raw text and sections for downstream
    raw_text: str = ""
    sections: Dict[str, str] = field(default_factory=dict)


@dataclass
class Column:
    x_start: float
    x_end: float


@dataclass
class TableRegion:
    content: str
    rows: List[List[str]]


@dataclass
class DOCXParagraph:
    text: str
    style: Optional[str]
    is_bold: bool
    is_italic: bool
    font_size: Optional[float]
    indentation: float
    is_list_item: bool
    list_level: int
    is_heading_style: bool = False


@dataclass
class DetectedHeader:
    text: str
    canonical: str
    original: str
    line_index: int
    confidence: float


@dataclass
class DocumentSection:
    canonical: str
    original_header: str
    content: str
    start_line: int
    end_line: int
