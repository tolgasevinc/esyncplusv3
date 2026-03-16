-- dia_carikartlar: potansiyel (boolean) ve carikarttipi (5 karakter) ekle
ALTER TABLE dia_carikartlar ADD COLUMN potansiyel INTEGER DEFAULT 0;
ALTER TABLE dia_carikartlar ADD COLUMN carikarttipi TEXT;
