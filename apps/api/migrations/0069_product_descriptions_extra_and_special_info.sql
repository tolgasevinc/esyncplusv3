-- IdeaSoft / e-ticaret: detail.extraDetails ve ProductSpecialInfo eşlenimi (title, content, status)
ALTER TABLE product_descriptions ADD COLUMN extra_description TEXT;
ALTER TABLE product_descriptions ADD COLUMN special_info_title TEXT;
ALTER TABLE product_descriptions ADD COLUMN special_info_content TEXT;
ALTER TABLE product_descriptions ADD COLUMN special_info_status INTEGER DEFAULT 1;
