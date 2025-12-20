FROM php:8.2-fpm-alpine

RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libzip-dev \
    zip \
    unzip \
    oniguruma-dev \
    postgresql-dev \
    mysql-client \
    && docker-php-ext-install pdo_mysql pdo_pgsql mbstring exif pcntl bcmath gd zip

RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /var/www/html

COPY . .

RUN if [ -f "composer.json" ]; then \
    composer install --no-dev --optimize-autoloader --no-interaction; \
    fi

RUN chown -R www-data:www-data /var/www/html \
    && ( [ -d "/var/www/html/storage" ] && chmod -R 755 /var/www/html/storage || true ) \
    && ( [ -d "/var/www/html/bootstrap/cache" ] && chmod -R 755 /var/www/html/bootstrap/cache || true )

EXPOSE 9000

CMD ["php-fpm"]

