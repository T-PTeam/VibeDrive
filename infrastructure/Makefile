.PHONY: up down logs restart rebuild clean full-up full-down full-logs

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

api-logs:
	docker-compose logs -f api

redis-logs:
	docker-compose logs -f redis

mysql-logs:
	docker-compose logs -f mysql

restart:
	docker-compose restart

rebuild:
	docker-compose up -d --build

clean:
	docker-compose down -v

full-up:
	docker-compose --profile full up -d

full-down:
	docker-compose --profile full down

full-logs:
	docker-compose --profile full logs -f

full-rebuild:
	docker-compose --profile full up -d --build

mobile-up:
	docker-compose --profile mobile up -d

mobile-down:
	docker-compose --profile mobile down

mobile-logs:
	docker-compose --profile mobile logs -f

mobile-rebuild:
	docker-compose --profile mobile up -d --build

all-up:
	docker-compose --profile full --profile mobile up -d

all-down:
	docker-compose --profile full --profile mobile down

all-logs:
	docker-compose --profile full --profile mobile logs -f

prod-up:
	docker-compose -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

prod-rebuild:
	docker-compose -f docker-compose.prod.yml up -d --build

