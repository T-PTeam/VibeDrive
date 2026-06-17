# VibeDrive Monorepo

This repository contains the complete VibeDrive application stack organized as a monorepo.

## Project Structure

```
VibeDrive/
├── backend-php/          # Laravel backend API
├── microservice-net/     # .NET 8 microservices
├── mobile-app/          # React Native mobile application
└── infrastructure/      # Docker and deployment configurations
```

## Technology Stack

- **Backend (PHP)**: Laravel framework
- **Microservices (.NET)**: .NET 8
- **Mobile App**: React Native
- **Infrastructure**: Docker, deployment configs

## Getting Started

### Prerequisites

- PHP 8.1+ and Composer (for backend-php)
- .NET 8 SDK (for microservice-net)
- Node.js 18+ and npm/yarn (for mobile-app)
- Docker and Docker Compose (for infrastructure)

### Quick Start with Docker

The easiest way to get started is using Docker:

```bash
cd infrastructure
docker-compose up -d
```

This will start:
- Redis on port `6379`
- MySQL on port `3306`
- .NET API on ports `5009` (HTTP) and `7217` (HTTPS)

To start all services including PHP backend and Nginx:
```bash
docker-compose --profile full up -d
```

To start with mobile app (web version):
```bash
docker-compose --profile mobile up -d
```

To start everything:
```bash
docker-compose --profile full --profile mobile up -d
```

See [infrastructure/README.md](infrastructure/README.md) for more details.

### Development Setup

Each subdirectory contains its own setup instructions. Please refer to the README files in each directory for specific setup instructions.

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Submit a pull request

## License

[Add your license here]

