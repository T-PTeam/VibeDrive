FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["VibeDrive.Api/VibeDrive.Api.csproj", "VibeDrive.Api/"]
RUN dotnet restore "VibeDrive.Api/VibeDrive.Api.csproj"
COPY . .
WORKDIR "/src/VibeDrive.Api"
RUN dotnet build "VibeDrive.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "VibeDrive.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "VibeDrive.Api.dll"]

