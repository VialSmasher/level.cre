import type { Express, Request } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getUserId, requireAuth } from "../../auth";
import { pool } from "../../db";
import { ensureUser } from "../../ensureUser";

type DbValue = string | number | boolean | Date | null | undefined;

function isDemoRequest(req: Request) {
  return req.headers["x-demo-mode"] === "true" || getUserId(req) === "demo-user";
}

function migrationPath() {
  const candidates = [
    path.resolve(process.cwd(), "drizzle/0013_resident_loyalty_core.sql"),
    path.resolve(process.cwd(), "../../drizzle/0013_resident_loyalty_core.sql"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function ensureResidentLoyaltyTables() {
  const file = migrationPath();
  if (!file) {
    throw new Error("Resident loyalty migration file was not found");
  }
  await pool.query(fs.readFileSync(file, "utf8"));
}

function dateOnly(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoDateTime(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function shortUserSlug(userId: string) {
  return userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "demo";
}

async function queryOne<T = any>(sql: string, params: DbValue[] = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] as T | undefined;
}

async function bootstrapResidentLoyaltyIfEmpty(userId: string, email?: string | null) {
  await ensureUser(userId, email);

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.resident_loyalty_landlords WHERE owner_user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing) return;

  const landlordId = randomUUID();
  const buildingId = randomUUID();
  const unit101Id = randomUUID();
  const unit102Id = randomUUID();
  const ameliaId = randomUUID();
  const mateoId = randomUUID();
  const slug = `maclaren-house-${shortUserSlug(userId)}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO public.resident_loyalty_landlords (id, owner_user_id, name, manager_name)
        VALUES ($1, $2, $3, $4)
      `,
      [landlordId, userId, "Rivergate Residential", "Priya Shah"],
    );
    await client.query(
      `
        INSERT INTO public.resident_loyalty_memberships (landlord_id, user_id, role)
        VALUES ($1, $2, 'landlord_owner')
      `,
      [landlordId, userId],
    );
    await client.query(
      `
        INSERT INTO public.resident_loyalty_buildings
          (id, landlord_id, name, address, neighbourhood, portal_slug, unit_count)
        VALUES ($1, $2, $3, $4, $5, $6, 16)
      `,
      [buildingId, landlordId, "Maclaren House", "10418 122 Street NW, Edmonton", "Oliver", slug],
    );
    await client.query(
      `
        INSERT INTO public.resident_loyalty_units
          (id, building_id, unit_number, floor, bedrooms, occupancy_status)
        VALUES
          ($1, $3, '101', 1, 2, 'occupied'),
          ($2, $3, '102', 1, 1, 'occupied')
      `,
      [unit101Id, unit102Id, buildingId],
    );
    await client.query(
      `
        INSERT INTO public.resident_loyalty_residents
          (id, building_id, unit_id, name, email, move_in_date, rent_streak_months, autopay_status, renewal_window)
        VALUES
          ($1, $3, $4, 'Amelia Wong', 'amelia.wong@example.com', '2026-06-01', 7, 'enabled', 'active'),
          ($2, $3, $5, 'Mateo Reyes', 'mateo.reyes@example.com', '2026-07-01', 2, 'interested', 'upcoming')
      `,
      [ameliaId, mateoId, buildingId, unit101Id, unit102Id],
    );
    await client.query(
      `
        INSERT INTO public.resident_loyalty_tenant_lifecycles
          (
            id, resident_id, building_id, unit_id, invite_status, portal_slug,
            lease_document_name, lease_status, lease_start_date, lease_end_date, lease_acknowledged_at,
            security_deposit_amount_label, security_deposit_status, security_deposit_confirmed_at,
            next_rent_amount_label, next_rent_due_date, next_rent_status,
            move_in_inspection_status, move_in_photo_count, move_in_issue_count, move_in_submitted_at
          )
        VALUES
          (
            $1, $3, $5, $6, 'accepted', $8,
            'Maclaren House Unit 101 Lease.pdf', 'acknowledged', '2026-06-01', '2027-05-31', '2026-05-18T18:20:00.000Z',
            '$1,250', 'confirmed', '2026-05-19T16:00:00.000Z',
            '$1,650', '2026-07-01', 'upcoming',
            'manager_review', 9, 2, '2026-05-30T20:35:00.000Z'
          ),
          (
            $2, $4, $5, $7, 'sent', $9,
            'Maclaren House Unit 102 Lease.pdf', 'uploaded', '2026-07-01', '2027-06-30', NULL,
            '$1,150', 'received', NULL,
            '$1,525', '2026-07-01', 'not_due',
            'not_started', 0, 0, NULL
          )
      `,
      [
        randomUUID(),
        randomUUID(),
        ameliaId,
        mateoId,
        buildingId,
        unit101Id,
        unit102Id,
        `${slug}/unit-101`,
        `${slug}/unit-102`,
      ],
    );

    const steps = [
      [ameliaId, unit101Id, "tenant_invite_sent", "Accept resident portal invite", "Use the property-branded portal link to start move-in.", "complete", null, null, "2026-05-18T16:10:00.000Z"],
      [ameliaId, unit101Id, "lease_acknowledged", "Acknowledge lease packet", "Confirm the lease document and key dates are visible.", "complete", null, null, "2026-05-18T18:20:00.000Z"],
      [ameliaId, unit101Id, "security_deposit_confirmed", "Confirm security deposit status", "Record that the deposit was received outside this app.", "complete", null, null, "2026-05-19T16:00:00.000Z"],
      [ameliaId, unit101Id, "move_in_inspection_completed", "Submit move-in condition inspection", "Add room-by-room notes and photos for manager review.", "manager_review", 250, "2026-06-05T23:59:00.000Z", null],
      [ameliaId, unit101Id, "building_rules_acknowledged", "Acknowledge building rules", "Confirm move-in hours, waste room, parking, and quiet hours.", "complete", 25, null, "2026-05-20T14:20:00.000Z"],
      [ameliaId, unit101Id, "utility_setup_confirmed", "Confirm utility setup", "Upload or acknowledge utility account setup status.", "submitted", null, null, null],
      [ameliaId, unit101Id, "first_rent_status_reviewed", "Review next rent due date", "Show the next due date and status without processing payment.", "complete", null, null, "2026-05-21T15:30:00.000Z"],
      [mateoId, unit102Id, "tenant_invite_sent", "Accept resident portal invite", "Use the property-branded portal link to start move-in.", "todo", null, null, null],
      [mateoId, unit102Id, "lease_acknowledged", "Acknowledge lease packet", "Confirm lease document and key dates.", "todo", null, null, null],
      [mateoId, unit102Id, "security_deposit_confirmed", "Confirm security deposit status", "Record that the deposit was received outside this app.", "manager_review", null, null, null],
      [mateoId, unit102Id, "move_in_inspection_completed", "Submit move-in condition inspection", "Add room-by-room notes and photos after keys are issued.", "todo", 250, "2026-07-03T23:59:00.000Z", null],
      [mateoId, unit102Id, "building_rules_acknowledged", "Acknowledge building rules", "Confirm move-in hours, waste room, parking, and quiet hours.", "todo", 25, null, null],
      [mateoId, unit102Id, "first_rent_status_reviewed", "Review first rent due date", "Show due date and status without processing payment.", "todo", null, null, null],
    ] as const;

    for (const [residentId, unitId, type, title, description, status, points, dueAt, completedAt] of steps) {
      await client.query(
        `
          INSERT INTO public.resident_loyalty_onboarding_steps
            (resident_id, building_id, unit_id, type, title, description, status, points, due_at, completed_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [residentId, buildingId, unitId, type, title, description, status, points, dueAt, completedAt],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadStateForUser(userId: string) {
  const landlords = await pool.query(
    `
      SELECT id, name, manager_name
      FROM public.resident_loyalty_landlords
      WHERE owner_user_id = $1
      ORDER BY created_at ASC
    `,
    [userId],
  );
  const buildings = await pool.query(
    `
      SELECT b.id, b.landlord_id, b.name, b.address, b.neighbourhood, b.unit_count
      FROM public.resident_loyalty_buildings b
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE l.owner_user_id = $1
      ORDER BY b.created_at ASC
    `,
    [userId],
  );
  const units = await pool.query(
    `
      SELECT u.id, u.building_id, u.unit_number, u.floor, u.bedrooms, u.occupancy_status
      FROM public.resident_loyalty_units u
      JOIN public.resident_loyalty_buildings b ON b.id = u.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE l.owner_user_id = $1
      ORDER BY u.unit_number ASC
    `,
    [userId],
  );
  const residents = await pool.query(
    `
      SELECT r.id, r.building_id, r.unit_id, r.name, r.email, r.move_in_date,
             r.rent_streak_months, r.autopay_status, r.renewal_window
      FROM public.resident_loyalty_residents r
      JOIN public.resident_loyalty_buildings b ON b.id = r.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE l.owner_user_id = $1
      ORDER BY r.created_at ASC
    `,
    [userId],
  );
  const lifecycles = await pool.query(
    `
      SELECT tl.*
      FROM public.resident_loyalty_tenant_lifecycles tl
      JOIN public.resident_loyalty_buildings b ON b.id = tl.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE l.owner_user_id = $1
      ORDER BY tl.created_at ASC
    `,
    [userId],
  );
  const steps = await pool.query(
    `
      SELECT os.*
      FROM public.resident_loyalty_onboarding_steps os
      JOIN public.resident_loyalty_buildings b ON b.id = os.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE l.owner_user_id = $1
      ORDER BY os.created_at ASC
    `,
    [userId],
  );

  const residentsByUnit = new Map<string, string>();
  for (const resident of residents.rows) {
    residentsByUnit.set(resident.unit_id, resident.id);
  }

  return {
    landlords: landlords.rows.map((row) => ({
      id: row.id,
      name: row.name,
      managerName: row.manager_name,
    })),
    buildings: buildings.rows.map((row) => ({
      id: row.id,
      landlordId: row.landlord_id,
      name: row.name,
      address: row.address || "",
      neighbourhood: row.neighbourhood || "",
      unitCount: Number(row.unit_count || 0),
    })),
    units: units.rows.map((row) => ({
      id: row.id,
      buildingId: row.building_id,
      unitNumber: row.unit_number,
      floor: Number(row.floor || 0),
      bedrooms: Number(row.bedrooms || 0),
      residentId: residentsByUnit.get(row.id),
      occupancyStatus: row.occupancy_status,
    })),
    residents: residents.rows.map((row) => ({
      id: row.id,
      buildingId: row.building_id,
      unitId: row.unit_id,
      name: row.name,
      email: row.email,
      moveInDate: dateOnly(row.move_in_date) || "",
      rentStreakMonths: Number(row.rent_streak_months || 0),
      autopayStatus: row.autopay_status,
      renewalWindow: row.renewal_window,
    })),
    tenantLifecycles: lifecycles.rows.map((row) => ({
      id: row.id,
      residentId: row.resident_id,
      buildingId: row.building_id,
      unitId: row.unit_id,
      inviteStatus: row.invite_status,
      portalSlug: row.portal_slug,
      lease: {
        documentName: row.lease_document_name || "",
        status: row.lease_status,
        startDate: dateOnly(row.lease_start_date) || "",
        endDate: dateOnly(row.lease_end_date) || "",
        acknowledgedAt: isoDateTime(row.lease_acknowledged_at),
      },
      securityDeposit: {
        amountLabel: row.security_deposit_amount_label || "",
        status: row.security_deposit_status,
        confirmedAt: isoDateTime(row.security_deposit_confirmed_at),
      },
      nextRent: {
        amountLabel: row.next_rent_amount_label || "",
        dueDate: dateOnly(row.next_rent_due_date) || "",
        status: row.next_rent_status,
      },
      moveInInspection: {
        status: row.move_in_inspection_status,
        photoCount: Number(row.move_in_photo_count || 0),
        issueCount: Number(row.move_in_issue_count || 0),
        submittedAt: isoDateTime(row.move_in_submitted_at),
      },
    })),
    onboardingSteps: steps.rows.map((row) => ({
      id: row.id,
      residentId: row.resident_id,
      buildingId: row.building_id,
      unitId: row.unit_id,
      type: row.type,
      title: row.title,
      description: row.description || "",
      status: row.status,
      points: row.points === null || row.points === undefined ? undefined : Number(row.points),
      dueAt: isoDateTime(row.due_at),
      completedAt: isoDateTime(row.completed_at),
    })),
  };
}

async function ensureResidentOwned(userId: string, residentId: string) {
  const row = await queryOne<{ id: string }>(
    `
      SELECT r.id
      FROM public.resident_loyalty_residents r
      JOIN public.resident_loyalty_buildings b ON b.id = r.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE r.id = $1 AND l.owner_user_id = $2
      LIMIT 1
    `,
    [residentId, userId],
  );
  if (!row) {
    const error = new Error("Resident not found");
    (error as any).status = 404;
    throw error;
  }
}

async function ensureStepOwned(userId: string, stepId: string) {
  const row = await queryOne<{ id: string; resident_id: string }>(
    `
      SELECT os.id, os.resident_id
      FROM public.resident_loyalty_onboarding_steps os
      JOIN public.resident_loyalty_buildings b ON b.id = os.building_id
      JOIN public.resident_loyalty_landlords l ON l.id = b.landlord_id
      WHERE os.id = $1 AND l.owner_user_id = $2
      LIMIT 1
    `,
    [stepId, userId],
  );
  if (!row) {
    const error = new Error("Onboarding step not found");
    (error as any).status = 404;
    throw error;
  }
  return row;
}

async function completeStepByType(residentId: string, type: string, status = "complete") {
  await pool.query(
    `
      UPDATE public.resident_loyalty_onboarding_steps
      SET status = $3,
          completed_at = CASE WHEN $3 = 'complete' THEN now() ELSE completed_at END,
          updated_at = now()
      WHERE resident_id = $1 AND type = $2
    `,
    [residentId, type, status],
  );
}

function asyncHandler(fn: (req: Request, res: any) => Promise<void>) {
  return (req: Request, res: any, next: any) => {
    fn(req, res).catch(next);
  };
}

async function sendState(res: any, userId: string) {
  res.json({ source: "database", state: await loadStateForUser(userId) });
}

export async function registerResidentLoyaltyRoutes(app: Express): Promise<void> {
  await ensureResidentLoyaltyTables();

  app.get("/api/resident-loyalty/state", requireAuth, asyncHandler(async (req, res) => {
    if (isDemoRequest(req)) {
      res.json({ source: "frontend-demo", state: null });
      return;
    }
    const userId = getUserId(req);
    await bootstrapResidentLoyaltyIfEmpty(userId, (req as any)?.user?.email || null);
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/invite", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `UPDATE public.resident_loyalty_tenant_lifecycles SET invite_status = 'sent', updated_at = now() WHERE resident_id = $1`,
      [req.params.residentId],
    );
    await completeStepByType(req.params.residentId, "tenant_invite_sent", "complete");
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/accept-invite", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `UPDATE public.resident_loyalty_tenant_lifecycles SET invite_status = 'accepted', updated_at = now() WHERE resident_id = $1`,
      [req.params.residentId],
    );
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/lease-acknowledged", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `
        UPDATE public.resident_loyalty_tenant_lifecycles
        SET lease_status = 'acknowledged', lease_acknowledged_at = now(), updated_at = now()
        WHERE resident_id = $1
      `,
      [req.params.residentId],
    );
    await completeStepByType(req.params.residentId, "lease_acknowledged", "complete");
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/deposit-confirmed", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `
        UPDATE public.resident_loyalty_tenant_lifecycles
        SET security_deposit_status = 'confirmed', security_deposit_confirmed_at = now(), updated_at = now()
        WHERE resident_id = $1
      `,
      [req.params.residentId],
    );
    await completeStepByType(req.params.residentId, "security_deposit_confirmed", "complete");
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/inspection-submit", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `
        UPDATE public.resident_loyalty_tenant_lifecycles
        SET move_in_inspection_status = 'manager_review',
            move_in_photo_count = GREATEST(move_in_photo_count, 8),
            move_in_issue_count = GREATEST(move_in_issue_count, 1),
            move_in_submitted_at = COALESCE(move_in_submitted_at, now()),
            updated_at = now()
        WHERE resident_id = $1
      `,
      [req.params.residentId],
    );
    await completeStepByType(req.params.residentId, "move_in_inspection_completed", "manager_review");
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/residents/:residentId/inspection-approve", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureResidentOwned(userId, req.params.residentId);
    await pool.query(
      `
        UPDATE public.resident_loyalty_tenant_lifecycles
        SET move_in_inspection_status = 'completed', updated_at = now()
        WHERE resident_id = $1
      `,
      [req.params.residentId],
    );
    await completeStepByType(req.params.residentId, "move_in_inspection_completed", "complete");
    await sendState(res, userId);
  }));

  app.post("/api/resident-loyalty/onboarding-steps/:stepId/complete", requireAuth, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await ensureStepOwned(userId, req.params.stepId);
    await pool.query(
      `
        UPDATE public.resident_loyalty_onboarding_steps
        SET status = 'complete', completed_at = now(), updated_at = now()
        WHERE id = $1
      `,
      [req.params.stepId],
    );
    await sendState(res, userId);
  }));
}
