-- Cases table for perfusion charting
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  group_id UUID,

  -- Case identifiers (no full PHI until HIPAA compliant)
  case_number TEXT,
  patient_initials TEXT,
  dob_year INTEGER,
  age INTEGER,
  sex TEXT,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  bsa NUMERIC,

  -- Case info
  case_date DATE,
  procedure TEXT,
  surgeon TEXT,
  anesthesiologist TEXT,

  -- CPB times
  cpb_start TEXT,
  cpb_end TEXT,
  cpb_total_min INTEGER,
  xclamp_start TEXT,
  xclamp_end TEXT,
  xclamp_total_min INTEGER,
  circ_arrest_min INTEGER,

  -- Circuit
  oxygenator TEXT,
  arterial_cannula TEXT,
  venous_cannula TEXT,
  prime_composition TEXT,
  prime_volume_ml INTEGER,

  -- Cardioplegia
  cardioplegia_type TEXT,
  cardioplegia_volume_ml INTEGER,

  -- Labs
  pre_hct NUMERIC,
  pre_act INTEGER,
  low_hct NUMERIC,
  peak_act INTEGER,
  post_hct NUMERIC,
  final_k NUMERIC,
  final_glucose NUMERIC,

  -- Heparin / Protamine
  heparin_total_units INTEGER,
  protamine_mg INTEGER,

  -- Blood products given
  prbc_units INTEGER DEFAULT 0,
  ffp_units INTEGER DEFAULT 0,
  platelets_units INTEGER DEFAULT 0,
  cryo_units INTEGER DEFAULT 0,
  cell_saver_ml INTEGER DEFAULT 0,

  -- Volumes
  uf_volume_ml INTEGER,
  urine_output_ml INTEGER,

  -- Notes
  notes TEXT,
  complications TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_date ON cases(case_date DESC);
