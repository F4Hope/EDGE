-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'POSTPONED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('BETTABLE', 'WATCH', 'HIGH_RISK', 'NO_BET');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('ACTIVE', 'REMOVED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ComboRiskMode" AS ENUM ('LOW', 'BALANCED', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "ComboStatus" AS ENUM ('DRAFT', 'READY', 'REJECTED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING', 'FINAL', 'VOID');

-- CreateEnum
CREATE TYPE "IntelligenceSignalType" AS ENUM ('INJURY', 'SUSPENSION', 'LINEUP', 'WITHDRAWAL', 'SCHEDULE_CHANGE', 'POSTPONEMENT', 'WEATHER', 'NEWS');

-- CreateEnum
CREATE TYPE "IntelligenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "sportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "country" TEXT,
    "sportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT,
    "fullName" TEXT NOT NULL,
    "country" TEXT,
    "sportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homePlayerId" TEXT,
    "awayPlayerId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSource" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceSportKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line" DECIMAL(10,4),
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsSnapshot" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bookmakerKey" TEXT,
    "bookmakerName" TEXT,
    "selectionKey" TEXT NOT NULL,
    "selectionName" TEXT NOT NULL,
    "point" DECIMAL(12,4),
    "decimalOdds" DECIMAL(12,4) NOT NULL,
    "providerUpdatedAt" TIMESTAMP(3),
    "fingerprint" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "fingerprint" TEXT,
    "values" JSONB NOT NULL,
    "dataQuality" DECIMAL(6,5),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "status" "ModelRunStatus" NOT NULL DEFAULT 'RUNNING',
    "parameters" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "modelRunId" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "modelProbability" DECIMAL(7,6) NOT NULL,
    "impliedProbability" DECIMAL(7,6),
    "estimatedEdge" DECIMAL(8,6),
    "estimatedValue" DECIMAL(8,6),
    "edgeScore" INTEGER,
    "risk" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "PredictionStatus" NOT NULL DEFAULT 'WATCH',
    "dataQuality" DECIMAL(6,5),
    "modelAgreement" DECIMAL(6,5),
    "explanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceSignal" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fingerprint" TEXT,
    "type" "IntelligenceSignalType" NOT NULL,
    "severity" "IntelligenceSeverity" NOT NULL,
    "source" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "affectsHome" BOOLEAN,
    "affectsAway" BOOLEAN,
    "participant" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCheckpoint" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "predictionId" TEXT NOT NULL,
    "oddsAtSelection" DECIMAL(12,4),
    "status" "SelectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "targetOdds" DECIMAL(12,4),
    "actualOdds" DECIMAL(12,4),
    "estimatedProbability" DECIMAL(7,6),
    "estimatedValue" DECIMAL(8,6),
    "edgeScore" INTEGER,
    "correlationScore" DECIMAL(6,5),
    "riskMode" "ComboRiskMode" NOT NULL DEFAULT 'BALANCED',
    "status" "ComboStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboSelection" (
    "comboId" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComboSelection_pkey" PRIMARY KEY ("comboId","selectionId")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_key_key" ON "Sport"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");

-- CreateIndex
CREATE INDEX "League_sportId_idx" ON "League"("sportId");

-- CreateIndex
CREATE INDEX "League_country_idx" ON "League"("country");

-- CreateIndex
CREATE UNIQUE INDEX "League_sportId_provider_externalId_key" ON "League"("sportId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Team_sportId_name_idx" ON "Team"("sportId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sportId_provider_externalId_key" ON "Team"("sportId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Player_sportId_fullName_idx" ON "Player"("sportId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Player_sportId_provider_externalId_key" ON "Player"("sportId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Event_sportId_startTime_idx" ON "Event"("sportId", "startTime");

-- CreateIndex
CREATE INDEX "Event_leagueId_startTime_idx" ON "Event"("leagueId", "startTime");

-- CreateIndex
CREATE INDEX "Event_status_startTime_idx" ON "Event"("status", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Event_provider_externalId_key" ON "Event"("provider", "externalId");

-- CreateIndex
CREATE INDEX "EventSource_eventId_provider_idx" ON "EventSource"("eventId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EventSource_provider_externalId_key" ON "EventSource"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Market_eventId_status_idx" ON "Market"("eventId", "status");

-- CreateIndex
CREATE INDEX "Market_eventId_provider_key_idx" ON "Market"("eventId", "provider", "key");

-- CreateIndex
CREATE INDEX "Market_provider_externalId_idx" ON "Market"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "OddsSnapshot_fingerprint_key" ON "OddsSnapshot"("fingerprint");

-- CreateIndex
CREATE INDEX "OddsSnapshot_marketId_capturedAt_idx" ON "OddsSnapshot"("marketId", "capturedAt");

-- CreateIndex
CREATE INDEX "OddsSnapshot_marketId_bookmakerKey_selectionKey_capturedAt_idx" ON "OddsSnapshot"("marketId", "bookmakerKey", "selectionKey", "capturedAt");

-- CreateIndex
CREATE INDEX "OddsSnapshot_provider_capturedAt_idx" ON "OddsSnapshot"("provider", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_fingerprint_key" ON "Feature"("fingerprint");

-- CreateIndex
CREATE INDEX "Feature_eventId_modelVersion_computedAt_idx" ON "Feature"("eventId", "modelVersion", "computedAt");

-- CreateIndex
CREATE INDEX "Feature_modelVersion_computedAt_idx" ON "Feature"("modelVersion", "computedAt");

-- CreateIndex
CREATE INDEX "ModelRun_sportId_startedAt_idx" ON "ModelRun"("sportId", "startedAt");

-- CreateIndex
CREATE INDEX "ModelRun_modelVersion_startedAt_idx" ON "ModelRun"("modelVersion", "startedAt");

-- CreateIndex
CREATE INDEX "Prediction_eventId_createdAt_idx" ON "Prediction"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Prediction_marketId_createdAt_idx" ON "Prediction"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "Prediction_modelRunId_idx" ON "Prediction"("modelRunId");

-- CreateIndex
CREATE INDEX "Prediction_status_edgeScore_idx" ON "Prediction"("status", "edgeScore");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceSignal_fingerprint_key" ON "IntelligenceSignal"("fingerprint");

-- CreateIndex
CREATE INDEX "IntelligenceSignal_eventId_occurredAt_idx" ON "IntelligenceSignal"("eventId", "occurredAt");

-- CreateIndex
CREATE INDEX "IntelligenceSignal_eventId_severity_type_idx" ON "IntelligenceSignal"("eventId", "severity", "type");

-- CreateIndex
CREATE INDEX "SyncCheckpoint_provider_lastCompletedAt_idx" ON "SyncCheckpoint"("provider", "lastCompletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCheckpoint_provider_scope_key" ON "SyncCheckpoint"("provider", "scope");

-- CreateIndex
CREATE INDEX "Selection_userId_createdAt_idx" ON "Selection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Selection_predictionId_idx" ON "Selection"("predictionId");

-- CreateIndex
CREATE INDEX "Combo_userId_createdAt_idx" ON "Combo"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Combo_status_createdAt_idx" ON "Combo"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ComboSelection_selectionId_idx" ON "ComboSelection"("selectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboSelection_comboId_position_key" ON "ComboSelection"("comboId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Result_eventId_key" ON "Result"("eventId");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_homePlayerId_fkey" FOREIGN KEY ("homePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_awayPlayerId_fkey" FOREIGN KEY ("awayPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSource" ADD CONSTRAINT "EventSource_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRun" ADD CONSTRAINT "ModelRun_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_modelRunId_fkey" FOREIGN KEY ("modelRunId") REFERENCES "ModelRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceSignal" ADD CONSTRAINT "IntelligenceSignal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboSelection" ADD CONSTRAINT "ComboSelection_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboSelection" ADD CONSTRAINT "ComboSelection_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
