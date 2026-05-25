FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY DeadMansSwitch.Web/DeadMansSwitch.Web.csproj DeadMansSwitch.Web/
RUN dotnet restore DeadMansSwitch.Web/DeadMansSwitch.Web.csproj

COPY . .
RUN dotnet publish DeadMansSwitch.Web/DeadMansSwitch.Web.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "DeadMansSwitch.Web.dll"]
