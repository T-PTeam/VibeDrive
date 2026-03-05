# Database connection (MySQL)

## From host (DBeaver, CLI, IDE)

When using Docker, MySQL is exposed on port **3307** (host).

**DBeaver:** If you get "Public Key Retrieval is not allowed", open the connection → **Driver properties** (or **Edit connection** → **Driver properties**) and add:
- `allowPublicKeyRetrieval` = `true`

Or in the connection URL add: `?allowPublicKeyRetrieval=true`

| Field     | App user | Admin (root) |
|----------|----------|---------------|
| Host     | 127.0.0.1 | 127.0.0.1   |
| Port     | 3307     | 3307          |
| Database | vibedrive_db | vibedrive_db |
| Username | vibedrive | root          |
| Password | vibedrive | rootpassword  |

Use **root** / **rootpassword** for full access (e.g. DBeaver admin connection).

## From Laravel (backend-php)

Set in `.env` (see `.env.example`). When running inside Docker, `DB_HOST=mysql` and `DB_PORT=3306` (internal). When running locally (e.g. `php artisan serve`), use `DB_HOST=127.0.0.1` and `DB_PORT=3307`.

---

## Database structure (vibedrive_db)

### users
| Column             | Type         | Nullable | Notes                    |
|--------------------|--------------|----------|--------------------------|
| id                 | bigint       | no       | PK, auto increment       |
| name               | varchar(255) | no       |                          |
| email              | varchar(255) | no       | unique                   |
| email_verified_at  | timestamp    | yes      |                          |
| password           | varchar(255) | no       |                          |
| remember_token     | varchar(100) | yes      |                          |
| preferences_json   | json         | yes      |                          |
| created_at         | timestamp    | yes      |                          |
| updated_at         | timestamp    | yes      |                          |

### password_reset_tokens
| Column     | Type         | Nullable |
|------------|--------------|----------|
| email      | varchar(255) | no       | PK |
| token      | varchar(255) | no       |
| created_at | timestamp    | yes      |

### sessions
| Column       | Type    | Nullable | Notes     |
|--------------|---------|----------|-----------|
| id           | varchar | no       | PK        |
| user_id      | bigint  | yes      | FK → users|
| ip_address   | varchar(45) | yes   |           |
| user_agent   | text    | yes      |           |
| payload      | longtext| no       |           |
| last_activity| int     | no       | index     |

### cache
| Column     | Type       | Nullable |
|------------|------------|----------|
| key        | varchar(255) | no    | PK        |
| value      | mediumtext | no       |
| expiration | int        | no       | index     |

### cache_locks
| Column     | Type         | Nullable |
|------------|--------------|----------|
| key        | varchar(255) | no    | PK        |
| owner      | varchar(255) | no    |           |
| expiration | int          | no    | index     |

### jobs
| Column      | Type     | Nullable | Notes |
|-------------|----------|----------|-------|
| id          | bigint   | no       | PK   |
| queue       | varchar(255) | no  | index |
| payload     | longtext | no       |       |
| attempts    | tinyint unsigned | no |   |
| reserved_at | int unsigned | yes  |       |
| available_at| int unsigned | no  |       |
| created_at  | int unsigned | no  |       |

### job_batches
| Column       | Type       | Nullable |
|--------------|------------|----------|
| id           | varchar(255) | no    | PK   |
| name         | varchar(255) | no    |      |
| total_jobs   | int        | no       |
| pending_jobs | int        | no       |
| failed_jobs  | int        | no       |
| failed_job_ids | longtext | no     |
| options      | mediumtext | yes     |
| cancelled_at | int        | yes     |
| created_at   | int        | no       |
| finished_at  | int        | yes     |

### failed_jobs
| Column     | Type      | Nullable |
|------------|-----------|----------|
| id         | bigint    | no       | PK   |
| uuid       | varchar(255) | no   | unique |
| connection | text      | no       |
| queue      | text      | no       |
| payload    | longtext  | no       |
| exception  | longtext  | no       |
| failed_at  | timestamp | no       |

### chat_sessions
| Column    | Type         | Nullable | Notes              |
|------------|--------------|----------|--------------------|
| id         | bigint       | no       | PK                 |
| user_id    | bigint       | no       | FK → users, CASCADE|
| title      | varchar(255) | no       |                    |
| is_active  | boolean      | no       | default true       |
| created_at | timestamp    | yes      |                    |
| updated_at | timestamp    | yes      |                    |

### messages
| Column     | Type      | Nullable | Notes                   |
|------------|-----------|----------|-------------------------|
| id         | bigint    | no       | PK                      |
| session_id | bigint    | no       | FK → chat_sessions, CASCADE |
| role       | enum      | no       | 'user','system','assistant' |
| content    | longtext  | no       |                         |
| meta_data  | json      | yes      |                         |
| created_at | timestamp | no       |                         |

### personal_access_tokens (Laravel Sanctum)
| Column       | Type         | Nullable | Notes        |
|--------------|--------------|----------|--------------|
| id           | bigint       | no       | PK           |
| tokenable_type | varchar(255) | no    | polymorphic   |
| tokenable_id   | bigint     | no       | polymorphic   |
| name         | varchar(255) | no     |              |
| token        | varchar(64)  | no     | unique        |
| abilities    | text         | yes    |              |
| last_used_at | timestamp    | yes    |              |
| expires_at   | timestamp    | yes    | index        |
| created_at   | timestamp    | yes    |              |
| updated_at   | timestamp    | yes    |              |

### Relationships
- **chat_sessions** → user_id → **users**.id
- **messages** → session_id → **chat_sessions**.id
- **personal_access_tokens** → tokenable (User)
- **sessions** → user_id → **users**.id
