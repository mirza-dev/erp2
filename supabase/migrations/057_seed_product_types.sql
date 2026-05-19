-- ============================================================
-- 057 — Seed 8 hazır ürün tipi + alanları
-- Vana, Conta, Flans, Fitting, Bağlantı Elemanı, Enstrüman,
-- Sızdırmazlık Malzemesi, Diğer
-- Idempotent (ON CONFLICT DO NOTHING)
-- ============================================================

-- ── 1. Tipler ──────────────────────────────────────────────────
INSERT INTO product_types (id, name, description, icon, sort_order, is_system) VALUES
    ('00000000-0000-4000-8000-000000000001'::uuid,
        'Vana', 'Endüstriyel vanalar — gate, globe, ball, check, butterfly, control', '🔧', 10, true),
    ('00000000-0000-4000-8000-000000000002'::uuid,
        'Conta', 'Sızdırmazlık contaları — spiral wound, ring joint, soft cut', '⭕', 20, true),
    ('00000000-0000-4000-8000-000000000003'::uuid,
        'Flans', 'Boru flanşları — WN, SO, Blind, RTJ', '⚙️', 30, true),
    ('00000000-0000-4000-8000-000000000004'::uuid,
        'Fitting', 'Boru bağlantı elemanları — dirsek, T, redüksiyon, cap', '🔩', 40, true),
    ('00000000-0000-4000-8000-000000000005'::uuid,
        'Bağlantı Elemanı', 'Civata, somun, pul, saplama', '🔗', 50, true),
    ('00000000-0000-4000-8000-000000000006'::uuid,
        'Enstrüman', 'Basınç göstergesi, sıcaklık ölçer, sensör', '📊', 60, true),
    ('00000000-0000-4000-8000-000000000007'::uuid,
        'Sızdırmazlık Malzemesi', 'PTFE, grafit, aramid — bant, şerit, halka', '🧵', 70, true),
    ('00000000-0000-4000-8000-000000000008'::uuid,
        'Diğer', 'Yukarıdakilere uymayan ürünler', '📦', 80, true)
ON CONFLICT (id) DO NOTHING;

-- ── 2. VANA alanları ───────────────────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000001'::uuid, 'dn', 'DN (Nominal Çap)', 'DN (Nominal Diameter)', 'number', 'mm', NULL, true, 10),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'pn_class', 'PN / Sınıf', 'PN / Class', 'select', NULL,
        '["PN6","PN10","PN16","PN25","PN40","PN63","PN100","PN160","150LB","300LB","600LB","800LB","900LB","1500LB","2500LB","4500LB"]'::jsonb, true, 20),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'valve_type', 'Vana Tipi', 'Valve Type', 'select', NULL,
        '["Küresel (Ball)","Globe","Sürgülü (Gate)","Çek (Check)","Kelebek (Butterfly)","Kontrol (Control)","Kondenstop","Diyafram","İğne (Needle)"]'::jsonb, false, 30),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'end_connection', 'Bağlantı Tipi', 'End Connection', 'select', NULL,
        '["Flanşlı (Flanged)","Kaynaklı (Welded)","NPT","SW (Socket Weld)","BSP","Diş (Threaded)","Butt-Weld","Tri-Clamp"]'::jsonb, true, 40),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'actuator', 'Aktüatör', 'Actuator', 'select', NULL,
        '["Manuel","Volan","Elektrik","Pnömatik","Hidrolik","Dişli","Pnö-hidrolik"]'::jsonb, false, 50),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'body_material', 'Gövde Malzemesi', 'Body Material', 'text', NULL, NULL, true, 60),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'trim_material', 'Trim Malzemesi', 'Trim Material', 'text', NULL, NULL, false, 70),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'seat_material', 'Sızdırmazlık Yatak Malzemesi', 'Seat Material', 'text', NULL, NULL, false, 80),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'stem_material', 'Mil Malzemesi', 'Stem Material', 'text', NULL, NULL, false, 90),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'max_temp_c', 'Maks. Sıcaklık', 'Max Temperature', 'number', '°C', NULL, false, 100),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'max_pressure_bar', 'Maks. Basınç', 'Max Pressure', 'number', 'bar', NULL, false, 110),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'test_pressure_bar', 'Test Basıncı', 'Test Pressure', 'number', 'bar', NULL, false, 120),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'face_to_face_mm', 'Yüz-Yüz Boyu', 'Face-to-Face Length', 'number', 'mm', NULL, false, 130),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'gasket_type', 'Conta Tipi', 'Gasket Type', 'text', NULL, NULL, false, 140),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'approvals', 'Onaylar', 'Approvals', 'multiselect', NULL,
        '["CE","PED","API 6D","API 6A","API 600","ISO 9001","ATEX","SIL 3","NACE MR0175","TR-CU","DNV","Lloyd"]'::jsonb, false, 150),
    ('00000000-0000-4000-8000-000000000001'::uuid, 'standards', 'Standartlar', 'Standards', 'multiselect', NULL,
        '["ASME B16.34","ASME B16.5","EN 12266","API 600","API 6D","API 6A","API 602","BS 5352","DIN 3357"]'::jsonb, false, 160)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 3. CONTA alanları ──────────────────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000002'::uuid, 'inner_id_mm', 'İç Çap', 'Inner ID', 'number', 'mm', NULL, true, 10),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'outer_id_mm', 'Dış Çap', 'Outer ID', 'number', 'mm', NULL, true, 20),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'thickness_mm', 'Kalınlık', 'Thickness', 'number', 'mm', NULL, true, 30),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'style', 'Tip', 'Style', 'select', NULL,
        '["Spiral Wound","Ring Joint","Soft Cut","Camprofile","Metal Jacketed","Kammprofile"]'::jsonb, false, 40),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'hoop_material', 'Hoop Malzemesi', 'Hoop Material', 'text', NULL, NULL, false, 50),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'filler_material', 'Dolgu Malzemesi', 'Filler Material', 'select', NULL,
        '["Graphite","PTFE","Asbestos","Non-asbestos","Ceramic","Mica","Aramid"]'::jsonb, false, 60),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'inner_ring_material', 'İç Halka Malzemesi', 'Inner Ring Material', 'text', NULL, NULL, false, 70),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'outer_ring_material', 'Dış Halka Malzemesi', 'Outer Ring Material', 'text', NULL, NULL, false, 80),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'min_temp_c', 'Min. Sıcaklık', 'Min Temperature', 'number', '°C', NULL, false, 90),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'max_temp_c', 'Maks. Sıcaklık', 'Max Temperature', 'number', '°C', NULL, false, 100),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'max_pressure_bar', 'Maks. Basınç', 'Max Pressure', 'number', 'bar', NULL, false, 110),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'standards', 'Standartlar', 'Standards', 'multiselect', NULL,
        '["ASME B16.20","ASME B16.21","ASME B16.5","EN 1514","DIN 2690"]'::jsonb, false, 120),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'color_code', 'Renk Kodu', 'Color Code', 'text', NULL, NULL, false, 130)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 4. FLANS alanları ──────────────────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000003'::uuid, 'dn', 'DN (Nominal Çap)', 'DN (Nominal Diameter)', 'number', 'mm', NULL, true, 10),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'pn_class', 'PN / Sınıf', 'PN / Class', 'select', NULL,
        '["PN6","PN10","PN16","PN25","PN40","PN63","PN100","150LB","300LB","600LB","900LB","1500LB","2500LB"]'::jsonb, true, 20),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'flange_type', 'Flans Tipi', 'Flange Type', 'select', NULL,
        '["WN (Weld Neck)","SO (Slip-On)","Blind","Threaded","Lap Joint","Socket Weld","Flat Face"]'::jsonb, false, 30),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'face_type', 'Yüz Tipi', 'Face Type', 'select', NULL,
        '["RF (Raised Face)","FF (Flat Face)","RTJ (Ring Type Joint)","Tongue & Groove","Male & Female"]'::jsonb, false, 40),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'material', 'Malzeme', 'Material', 'text', NULL, NULL, true, 50),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'bolt_count', 'Cıvata Sayısı', 'Bolt Count', 'number', 'adet', NULL, false, 60),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'outer_diameter_mm', 'Dış Çap', 'Outer Diameter', 'number', 'mm', NULL, false, 70),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'hub_thickness_mm', 'Hub Kalınlığı', 'Hub Thickness', 'number', 'mm', NULL, false, 80),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'standards', 'Standartlar', 'Standards', 'multiselect', NULL,
        '["ASME B16.5","ASME B16.47","EN 1092-1","DIN 2632","DIN 2633","BS 4504"]'::jsonb, false, 90)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 5. FITTING alanları ────────────────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000004'::uuid, 'dn', 'DN (Nominal Çap)', 'DN (Nominal Diameter)', 'number', 'mm', NULL, true, 10),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'pn_class', 'PN / Sınıf', 'PN / Class', 'select', NULL,
        '["PN10","PN16","PN25","PN40","150LB","300LB","600LB","900LB","1500LB"]'::jsonb, false, 20),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'fitting_type', 'Fitting Tipi', 'Fitting Type', 'select', NULL,
        '["Dirsek (Elbow)","T","Redüksiyon (Reducer)","Cap","Cross","Y Süzgeç","Tee","Coupling"]'::jsonb, false, 30),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'schedule_no', 'Schedule No', 'Schedule', 'select', NULL,
        '["SCH 10","SCH 20","SCH 40","SCH 80","SCH 120","SCH 160","SCH XXS","STD","XS"]'::jsonb, false, 40),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'material', 'Malzeme', 'Material', 'text', NULL, NULL, true, 50),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'bend_radius', 'Eğilme Yarıçapı', 'Bend Radius', 'select', NULL,
        '["Long Radius","Short Radius","3D","5D"]'::jsonb, false, 60),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'standards', 'Standartlar', 'Standards', 'multiselect', NULL,
        '["ASME B16.9","ASME B16.11","ASME B16.28","EN 10253","DIN 2605"]'::jsonb, false, 70)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 6. BAĞLANTI ELEMANI alanları ──────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000005'::uuid, 'fastener_type', 'Tip', 'Type', 'select', NULL,
        '["Cıvata (Bolt)","Somun (Nut)","Pul (Washer)","Saplama (Stud)","Vida (Screw)"]'::jsonb, false, 5),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'length_mm', 'Boy', 'Length', 'number', 'mm', NULL, true, 10),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'diameter_mm', 'Çap', 'Diameter', 'number', 'mm', NULL, true, 20),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'thread_pitch', 'Diş Adımı', 'Thread Pitch', 'text', NULL, NULL, false, 30),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'material', 'Malzeme', 'Material', 'text', NULL, NULL, true, 40),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'grade', 'Grade', 'Grade', 'text', NULL, NULL, false, 50),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'coating', 'Kaplama', 'Coating', 'select', NULL,
        '["Çıplak","Galvaniz","Xylan","PTFE","Inox","Krom","Nikel","Zn-Ni"]'::jsonb, false, 60),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'standards', 'Standartlar', 'Standards', 'multiselect', NULL,
        '["ASTM A193","ASTM A320","ASTM A194","DIN 933","DIN 934","DIN 125","ISO 4014","ISO 4032"]'::jsonb, false, 70)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 7. ENSTRÜMAN alanları ─────────────────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000006'::uuid, 'instrument_type', 'Enstrüman Tipi', 'Instrument Type', 'select', NULL,
        '["Basınç Göstergesi","Sıcaklık Göstergesi","Akış Ölçer","Seviye Ölçer","Manometre","Termometre","Sensör","Transmitter"]'::jsonb, false, 5),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'measurement_range', 'Ölçüm Aralığı', 'Measurement Range', 'text', NULL, NULL, true, 10),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'accuracy', 'Hassasiyet', 'Accuracy', 'text', NULL, NULL, false, 20),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'process_connection_size', 'Proses Bağlantı Boyutu', 'Process Connection Size', 'text', NULL, NULL, false, 30),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'process_connection_type', 'Proses Bağlantı Tipi', 'Process Connection Type', 'select', NULL,
        '["NPT","BSP","Flanşlı","Tri-Clamp","SW","Butt-Weld"]'::jsonb, false, 40),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'body_material', 'Gövde Malzemesi', 'Body Material', 'text', NULL, NULL, false, 50),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'media_type', 'Akışkan Tipi', 'Media Type', 'text', NULL, NULL, false, 60),
    ('00000000-0000-4000-8000-000000000006'::uuid, 'approvals', 'Onaylar', 'Approvals', 'multiselect', NULL,
        '["CE","PED","ATEX","SIL 2","SIL 3","IECEx","NACE MR0175"]'::jsonb, false, 70)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- ── 8. SIZDIRMAZLIK MALZEMESİ alanları ────────────────────────
INSERT INTO product_type_fields (product_type_id, field_key, label_tr, label_en, field_type, unit, options, required, sort_order) VALUES
    ('00000000-0000-4000-8000-000000000007'::uuid, 'material_type', 'Malzeme Tipi', 'Material Type', 'select', NULL,
        '["PTFE","Genişletilmiş PTFE","Grafit","Aramid","Asbest-free","NBR","EPDM","Viton","Silikon"]'::jsonb, true, 10),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'form', 'Form', 'Form', 'select', NULL,
        '["Şerit","Bant","Halka","Pul","Sıvı (anaerobic)","Plaka","Boru"]'::jsonb, false, 20),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'dimensions', 'Boyutlar', 'Dimensions', 'text', NULL, NULL, false, 30),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'min_temp_c', 'Min. Sıcaklık', 'Min Temperature', 'number', '°C', NULL, false, 40),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'max_temp_c', 'Maks. Sıcaklık', 'Max Temperature', 'number', '°C', NULL, false, 50),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'max_pressure_bar', 'Maks. Basınç', 'Max Pressure', 'number', 'bar', NULL, false, 60),
    ('00000000-0000-4000-8000-000000000007'::uuid, 'chemical_compatibility', 'Kimyasal Uyumluluk', 'Chemical Compatibility', 'longtext', NULL, NULL, false, 70)
ON CONFLICT (product_type_id, field_key) DO NOTHING;

-- 8. DİĞER tipi boş (kullanıcı kendi alanlarını ekler)

-- ROLLBACK:
-- DELETE FROM product_type_fields
--     WHERE product_type_id IN (
--         '00000000-0000-4000-8000-000000000001'::uuid,
--         '00000000-0000-4000-8000-000000000002'::uuid,
--         '00000000-0000-4000-8000-000000000003'::uuid,
--         '00000000-0000-4000-8000-000000000004'::uuid,
--         '00000000-0000-4000-8000-000000000005'::uuid,
--         '00000000-0000-4000-8000-000000000006'::uuid,
--         '00000000-0000-4000-8000-000000000007'::uuid,
--         '00000000-0000-4000-8000-000000000008'::uuid
--     );
-- DELETE FROM product_types WHERE is_system = true;
