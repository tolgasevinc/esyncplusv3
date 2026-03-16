-- e_documents: vergiler dahil ödenecek tutar için para birimi
ALTER TABLE e_documents ADD COLUMN currency TEXT DEFAULT 'TRY';
