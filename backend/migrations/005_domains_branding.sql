-- Phase 4: hostname routing + per-college branding.

-- A college can also be served from its own domain (e.g. cp.mit.edu), in
-- addition to <slug>.<ROOT_DOMAIN>. Set by the operator (CLI), not self-serve:
-- claiming a domain needs DNS pointed at the platform, which only the operator can arrange.
ALTER TABLE colleges ADD COLUMN custom_domain VARCHAR(253) UNIQUE
    CHECK (custom_domain = LOWER(custom_domain));

-- Branding. NULL = use the platform defaults. Colors are #rrggbb; the API enforces
-- readable contrast on the app's dark background.
ALTER TABLE colleges ADD COLUMN brand_primary   CHAR(7) CHECK (brand_primary   ~ '^#[0-9a-f]{6}$');
ALTER TABLE colleges ADD COLUMN brand_secondary CHAR(7) CHECK (brand_secondary ~ '^#[0-9a-f]{6}$');
ALTER TABLE colleges ADD COLUMN tagline VARCHAR(120);

-- Slugs become hostnames, so they must be valid DNS labels (no trailing hyphen).
ALTER TABLE colleges ADD CONSTRAINT colleges_slug_dns_label CHECK (slug !~ '-$');
