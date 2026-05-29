from pydantic import BaseModel, Field


class AlertSettingsRead(BaseModel):
    p1_tsb_threshold:  float
    p2_resting_hr_pct: float
    p3_hrv_pct:        float
    p5_z45_pct:        float
    h1_ctl_delta:      float
    h2_tsb_high:       float
    h3_tss_pct:        float
    h5_z12_pct:        float

    model_config = {"from_attributes": True}


class AlertSettingsUpdate(BaseModel):
    p1_tsb_threshold:  float = Field(le=0,    ge=-100)   # должен быть отрицательным
    p2_resting_hr_pct: float = Field(ge=1,    le=30)
    p3_hrv_pct:        float = Field(ge=50,   le=100)
    p5_z45_pct:        float = Field(ge=5,    le=50)
    h1_ctl_delta:      float = Field(ge=0.5,  le=20)
    h2_tsb_high:       float = Field(ge=0,    le=50)
    h3_tss_pct:        float = Field(ge=10,   le=90)
    h5_z12_pct:        float = Field(ge=30,   le=95)
