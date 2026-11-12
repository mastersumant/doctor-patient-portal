-- ClinicDesk schema (MySQL 8), generated from src/data/schema/tables.ts.

CREATE TABLE `doctors` (
  `doctor_id` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `avatar_url` TEXT NOT NULL,
  `specialization` VARCHAR(120) NOT NULL,
  `qualifications` VARCHAR(200) NOT NULL,
  `registration_number` VARCHAR(60) NOT NULL,
  `clinic_name` VARCHAR(160) NOT NULL,
  `clinic_address` VARCHAR(400) NOT NULL,
  `contact_number` VARCHAR(20) NOT NULL,
  `experience_years` INTEGER,
  `signature_file_id` VARCHAR(64),
  `onboarding_complete` BOOLEAN NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`doctor_id`)
);

CREATE TABLE `patients` (
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `dob` DATE NOT NULL,
  `gender` VARCHAR(8) NOT NULL CHECK (`gender` IN ('Male', 'Female', 'Other')),
  `blood_group` VARCHAR(8) NOT NULL CHECK (`blood_group` IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown')),
  `photo_file_id` VARCHAR(64),
  `mobile` VARCHAR(20) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `address` VARCHAR(400) NOT NULL,
  `emergency_contact_name` VARCHAR(120) NOT NULL,
  `emergency_contact_number` VARCHAR(20) NOT NULL,
  `allergies` TEXT NOT NULL,
  `existing_conditions` TEXT NOT NULL,
  `chronic_diseases` TEXT NOT NULL,
  `previous_surgeries` TEXT NOT NULL,
  `family_history` TEXT NOT NULL,
  `current_medications` TEXT NOT NULL,
  `medical_notes` TEXT NOT NULL,
  `registration_date` DATE NOT NULL,
  `status` VARCHAR(8) NOT NULL CHECK (`status` IN ('Active', 'Inactive')),
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3),
  PRIMARY KEY (`patient_id`)
);
CREATE INDEX `ix_patients_doctor` ON `patients` (`doctor_id`);
CREATE INDEX `ix_patients_doctor_id_full_name` ON `patients` (`doctor_id`, `full_name`);
CREATE INDEX `ix_patients_doctor_id_mobile` ON `patients` (`doctor_id`, `mobile`);

CREATE TABLE `visits` (
  `visit_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `visit_date_time` DATETIME(3) NOT NULL,
  `visit_type` VARCHAR(16) NOT NULL CHECK (`visit_type` IN ('New Consultation', 'Follow-up', 'Emergency')),
  `chief_complaint` VARCHAR(300) NOT NULL,
  `symptoms` TEXT NOT NULL,
  `bp_systolic` INTEGER,
  `bp_diastolic` INTEGER,
  `heart_rate` INTEGER,
  `temperature_f` NUMERIC(7,2),
  `respiratory_rate` INTEGER,
  `spo2` INTEGER,
  `weight_kg` NUMERIC(7,2),
  `height_cm` NUMERIC(7,2),
  `bmi` NUMERIC(7,2),
  `observations` TEXT NOT NULL,
  `diagnosis_summary` TEXT NOT NULL,
  `treatment_plan` TEXT NOT NULL,
  `notes` TEXT NOT NULL,
  `follow_up_date` DATE,
  `appointment_id` VARCHAR(64),
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3),
  PRIMARY KEY (`visit_id`)
);
CREATE INDEX `ix_visits_doctor` ON `visits` (`doctor_id`);
CREATE INDEX `ix_visits_doctor_id_patient_id_visit_date_time` ON `visits` (`doctor_id`, `patient_id`, `visit_date_time`);

CREATE TABLE `diagnoses` (
  `diagnosis_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `visit_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `icd10_code` VARCHAR(10) NOT NULL,
  `description` TEXT NOT NULL,
  `symptoms` TEXT NOT NULL,
  `diagnosis_date` DATE NOT NULL,
  `severity` VARCHAR(8) NOT NULL CHECK (`severity` IN ('Mild', 'Moderate', 'Severe')),
  `status` VARCHAR(8) NOT NULL CHECK (`status` IN ('Active', 'Resolved', 'Chronic')),
  `treatment_notes` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3),
  PRIMARY KEY (`diagnosis_id`)
);
CREATE INDEX `ix_diagnoses_doctor` ON `diagnoses` (`doctor_id`);
CREATE INDEX `ix_diagnoses_doctor_id_patient_id` ON `diagnoses` (`doctor_id`, `patient_id`);
CREATE INDEX `ix_diagnoses_visit_id` ON `diagnoses` (`visit_id`);

CREATE TABLE `prescriptions` (
  `prescription_id` VARCHAR(64) NOT NULL,
  `rx_number` VARCHAR(20) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` VARCHAR(10) NOT NULL CHECK (`status` IN ('Issued', 'Superseded', 'Cancelled')),
  `superseded_by_id` VARCHAR(64),
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `visit_id` VARCHAR(64),
  `prescription_date` DATE NOT NULL,
  `diagnosis` TEXT NOT NULL,
  `instructions` TEXT NOT NULL,
  `follow_up_date` DATE,
  `edit_reason` VARCHAR(300) NOT NULL,
  `issued_at` DATETIME(3) NOT NULL,
  `snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`prescription_id`)
);
CREATE INDEX `ix_prescriptions_doctor` ON `prescriptions` (`doctor_id`);
CREATE INDEX `ix_prescriptions_doctor_id_rx_number_version` ON `prescriptions` (`doctor_id`, `rx_number`, `version`);
CREATE INDEX `ix_prescriptions_doctor_id_patient_id` ON `prescriptions` (`doctor_id`, `patient_id`);

CREATE TABLE `prescription_medicines` (
  `id` VARCHAR(64) NOT NULL,
  `prescription_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `medicine_id` VARCHAR(64),
  `medicine_name` VARCHAR(160) NOT NULL,
  `generic_name` VARCHAR(160) NOT NULL,
  `strength` VARCHAR(60) NOT NULL,
  `dosage` VARCHAR(60) NOT NULL,
  `dosage_form` VARCHAR(9) NOT NULL CHECK (`dosage_form` IN ('Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Inhaler', 'Sachet', 'Other')),
  `frequency` VARCHAR(16) NOT NULL CHECK (`frequency` IN ('Once Daily', 'Twice Daily', 'Thrice Daily', 'Four Times Daily', 'At Bedtime', 'As Required', 'Stat (once)')),
  `route` VARCHAR(13) NOT NULL CHECK (`route` IN ('Oral', 'Topical', 'Inhalation', 'Intravenous', 'Intramuscular', 'Subcutaneous', 'Ophthalmic', 'Otic', 'Nasal', 'Other')),
  `duration` VARCHAR(60) NOT NULL,
  `quantity` VARCHAR(60) NOT NULL,
  `timing` VARCHAR(13) NOT NULL CHECK (`timing` IN ('Before Food', 'After Food', 'With Food', 'Empty Stomach', 'Any Time')),
  `instructions` VARCHAR(300) NOT NULL,
  `sort_order` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
);
CREATE INDEX `ix_prescription_medicines_doctor` ON `prescription_medicines` (`doctor_id`);
CREATE INDEX `ix_prescription_medicines_prescription_id_sort_order` ON `prescription_medicines` (`prescription_id`, `sort_order`);

CREATE TABLE `medicines` (
  `medicine_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `generic_name` VARCHAR(160) NOT NULL,
  `brand_name` VARCHAR(160) NOT NULL,
  `manufacturer` VARCHAR(160) NOT NULL,
  `composition` VARCHAR(400) NOT NULL,
  `strength` VARCHAR(60) NOT NULL,
  `dosage_form` VARCHAR(9) NOT NULL CHECK (`dosage_form` IN ('Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Cream', 'Inhaler', 'Sachet', 'Other')),
  `route` VARCHAR(13) NOT NULL CHECK (`route` IN ('Oral', 'Topical', 'Inhalation', 'Intravenous', 'Intramuscular', 'Subcutaneous', 'Ophthalmic', 'Otic', 'Nasal', 'Other')),
  `category` VARCHAR(80) NOT NULL,
  `description` TEXT NOT NULL,
  `status` VARCHAR(8) NOT NULL CHECK (`status` IN ('Active', 'Inactive')),
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`medicine_id`)
);
CREATE INDEX `ix_medicines_doctor` ON `medicines` (`doctor_id`);
CREATE INDEX `ix_medicines_doctor_id_name` ON `medicines` (`doctor_id`, `name`);

CREATE TABLE `appointments` (
  `appointment_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `date` DATE NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `type` VARCHAR(12) NOT NULL CHECK (`type` IN ('Consultation', 'Follow-up', 'Procedure', 'Test Review', 'Emergency', 'Teleconsult')),
  `reason` VARCHAR(300) NOT NULL,
  `status` VARCHAR(9) NOT NULL CHECK (`status` IN ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show')),
  `notes` TEXT NOT NULL,
  `follow_up_id` VARCHAR(64),
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3),
  PRIMARY KEY (`appointment_id`)
);
CREATE INDEX `ix_appointments_doctor` ON `appointments` (`doctor_id`);
CREATE INDEX `ix_appointments_doctor_id_date_start_time` ON `appointments` (`doctor_id`, `date`, `start_time`);

CREATE TABLE `followups` (
  `follow_up_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `visit_id` VARCHAR(64),
  `due_date` DATE NOT NULL,
  `reason` VARCHAR(300) NOT NULL,
  `status` VARCHAR(9) NOT NULL CHECK (`status` IN ('Pending', 'Scheduled', 'Completed', 'Cancelled')),
  `appointment_id` VARCHAR(64),
  `notes` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`follow_up_id`)
);
CREATE INDEX `ix_followups_doctor` ON `followups` (`doctor_id`);
CREATE INDEX `ix_followups_doctor_id_status_due_date` ON `followups` (`doctor_id`, `status`, `due_date`);

CREATE TABLE `medical_documents` (
  `document_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `visit_id` VARCHAR(64),
  `name` VARCHAR(160) NOT NULL,
  `type` VARCHAR(17) NOT NULL CHECK (`type` IN ('Blood Test Report', 'X-Ray Report', 'MRI Report', 'CT Scan Report', 'Ultrasound Report', 'ECG', 'Discharge Summary', 'Other')),
  `description` TEXT NOT NULL,
  `upload_date` DATE NOT NULL,
  `file_id` VARCHAR(64) NOT NULL,
  `file_name` VARCHAR(200) NOT NULL,
  `mime_type` VARCHAR(80) NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3),
  PRIMARY KEY (`document_id`)
);
CREATE INDEX `ix_medical_documents_doctor` ON `medical_documents` (`doctor_id`);
CREATE INDEX `ix_medical_documents_doctor_id_patient_id` ON `medical_documents` (`doctor_id`, `patient_id`);

CREATE TABLE `audit_logs` (
  `audit_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64) NOT NULL,
  `entity` VARCHAR(40) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(20) NOT NULL,
  `detail` VARCHAR(400) NOT NULL,
  `at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`audit_id`)
);
CREATE INDEX `ix_audit_logs_doctor` ON `audit_logs` (`doctor_id`);
CREATE INDEX `ix_audit_logs_doctor_id_at` ON `audit_logs` (`doctor_id`, `at`);

-- Foreign keys. Circular cross-links (visit ↔ appointment ↔ follow-up) are checked by the app, not the database.
ALTER TABLE `patients` ADD CONSTRAINT `fk_patients_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `visits` ADD CONSTRAINT `fk_visits_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `visits` ADD CONSTRAINT `fk_visits_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `diagnoses` ADD CONSTRAINT `fk_diagnoses_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `diagnoses` ADD CONSTRAINT `fk_diagnoses_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `diagnoses` ADD CONSTRAINT `fk_diagnoses_visit_id` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`visit_id`);
ALTER TABLE `prescriptions` ADD CONSTRAINT `fk_prescriptions_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `prescriptions` ADD CONSTRAINT `fk_prescriptions_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `prescriptions` ADD CONSTRAINT `fk_prescriptions_visit_id` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`visit_id`);
ALTER TABLE `prescription_medicines` ADD CONSTRAINT `fk_prescription_medicines_prescription_id` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`prescription_id`);
ALTER TABLE `prescription_medicines` ADD CONSTRAINT `fk_prescription_medicines_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `prescription_medicines` ADD CONSTRAINT `fk_prescription_medicines_medicine_id` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`);
ALTER TABLE `medicines` ADD CONSTRAINT `fk_medicines_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `appointments` ADD CONSTRAINT `fk_appointments_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `appointments` ADD CONSTRAINT `fk_appointments_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `followups` ADD CONSTRAINT `fk_followups_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `followups` ADD CONSTRAINT `fk_followups_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `followups` ADD CONSTRAINT `fk_followups_visit_id` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`visit_id`);
ALTER TABLE `medical_documents` ADD CONSTRAINT `fk_medical_documents_patient_id` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`);
ALTER TABLE `medical_documents` ADD CONSTRAINT `fk_medical_documents_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
ALTER TABLE `medical_documents` ADD CONSTRAINT `fk_medical_documents_visit_id` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`visit_id`);
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_logs_doctor_id` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`);
