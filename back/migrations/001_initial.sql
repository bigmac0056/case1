-- Tables for DAMUMED Backend

CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255),
    login VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    phone VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    consultation_date TIMESTAMP NOT NULL,
    form_type VARCHAR(100),
    complaints TEXT,
    anamnesis TEXT,
    objective_status TEXT,
    appointments TEXT,
    diagnosis TEXT,
    recommendations TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    procedure_type VARCHAR(255) NOT NULL,
    specialist_name VARCHAR(255),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procedure_statuses (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES schedules(id),
    procedure_id VARCHAR(255) NOT NULL,
    patient_id INTEGER REFERENCES patients(id),
    status VARCHAR(50) DEFAULT 'pending',
    result_text TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sample data
INSERT INTO doctors (name, specialty, login, password_hash) VALUES
('Иванов Иван Иванович', 'Терапевт', 'ivanov', '$2b$12$placeholder'),
('Петрова Анна Сергеевна', 'Невролог', 'petrova', '$2b$12$placeholder'),
('Сидоров Алексей Петрович', 'ЛФК', 'sidorov', '$2b$12$placeholder');