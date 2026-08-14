-- ============================================
-- FINDER - DATABASE SCHEMA
-- ============================================

-- 1. Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 2. Locations
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(name, state, country)
);


-- 3. Search Requests
CREATE TABLE search_requests (
    id SERIAL PRIMARY KEY,

    category_id INTEGER NOT NULL
        REFERENCES categories(id),

    location_id INTEGER NOT NULL
        REFERENCES locations(id),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);


-- 4. Scraped Posts
CREATE TABLE scraped_posts (
    id SERIAL PRIMARY KEY,

    search_request_id INTEGER NOT NULL
        REFERENCES search_requests(id)
        ON DELETE CASCADE,

    instagram_id VARCHAR(255) NOT NULL,
    short_code VARCHAR(255),
    caption TEXT,
    hashtags JSONB,
    display_url TEXT,
    owner_username VARCHAR(255),
    owner_full_name VARCHAR(255),
    post_url TEXT,
    likes_count INTEGER,
    timestamp TIMESTAMPTZ,
    phone_number VARCHAR(50),
    price_text VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(search_request_id, instagram_id)
);


-- 5. Businesses
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,

    business_name VARCHAR(255) NOT NULL,

    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,

    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    instagram_username VARCHAR(255),
    instagram_page_id VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_instagram_page_id ON businesses (instagram_page_id) WHERE instagram_page_id IS NOT NULL;


-- 6. Properties
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,

    business_id INTEGER NOT NULL
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    search_request_id INTEGER NOT NULL
        REFERENCES search_requests(id)
        ON DELETE CASCADE,

    property_title VARCHAR(500),
    property_type VARCHAR(100),
    description TEXT,

    budget VARCHAR(255),

    address TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    ai_score INTEGER,
    ai_summary TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 6. Social Contents
CREATE TABLE social_contents (
    id SERIAL PRIMARY KEY,

    business_id INTEGER
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    property_id INTEGER
        REFERENCES properties(id)
        ON DELETE SET NULL,

    platform VARCHAR(50) NOT NULL DEFAULT 'INSTAGRAM',

    content_type VARCHAR(50),
    media_type VARCHAR(20) NOT NULL DEFAULT 'post',
    
    content_url TEXT NOT NULL,

    caption TEXT,

    media_url TEXT,
    video_url TEXT,

    published_at TIMESTAMPTZ,

    hashtags TEXT[],

    followers_count INTEGER,
    engagement_count INTEGER,

    source VARCHAR(100) DEFAULT 'APIFY',

    raw_data JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent same social content from being inserted twice
    UNIQUE(platform, content_url)
);


-- 7. AI Analysis
CREATE TABLE ai_analysis (
    id SERIAL PRIMARY KEY,

    business_id INTEGER
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    property_id INTEGER
        REFERENCES properties(id)
        ON DELETE SET NULL,

    category_score DECIMAL(5, 2),
    location_score DECIMAL(5, 2),
    business_score DECIMAL(5, 2),
    content_score DECIMAL(5, 2),

    overall_score DECIMAL(5, 2),

    is_real_estate BOOLEAN,
    is_location_relevant BOOLEAN,
    is_business_relevant BOOLEAN,

    reason TEXT,

    model_name VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 8. Shortlists
CREATE TABLE shortlists (
    id SERIAL PRIMARY KEY,

    search_request_id INTEGER NOT NULL
        REFERENCES search_requests(id)
        ON DELETE CASCADE,

    business_id INTEGER
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    property_id INTEGER
        REFERENCES properties(id)
        ON DELETE SET NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'SHORTLISTED',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(search_request_id, business_id, property_id)
);


-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_businesses_instagram_username
ON businesses(instagram_username);

CREATE INDEX idx_properties_business_id
ON properties(business_id);

CREATE INDEX idx_social_contents_business_id
ON social_contents(business_id);

CREATE INDEX idx_social_contents_property_id
ON social_contents(property_id);

CREATE INDEX idx_ai_analysis_business_id
ON ai_analysis(business_id);

CREATE INDEX idx_ai_analysis_overall_score
ON ai_analysis(overall_score);

CREATE INDEX idx_search_requests_status
ON search_requests(status);


-- ============================================
-- INITIAL MASTER DATA
-- ============================================

INSERT INTO categories (name)
VALUES ('Real Estate')
ON CONFLICT (name) DO NOTHING;


INSERT INTO locations (name, state, country)
VALUES ('Trichy', 'Tamil Nadu', 'India')
ON CONFLICT (name, state, country) DO NOTHING;