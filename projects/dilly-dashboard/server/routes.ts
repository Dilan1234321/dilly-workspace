import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import pkg from "pg";
const { Pool } = pkg;

const DB_PASSWORD = process.env.DILLY_DB_PASSWORD || "TedsyBoy2025!!$())($))!!$(";

const pool = new Pool({
  host: process.env.DILLY_DB_HOST || "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
  database: "dilly",
  user: "dilly_admin",
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Health
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, live: true });
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    }
  });

  // Main traction metrics
  app.get("/api/traction/overview", async (_req, res) => {
    const client = await pool.connect();
    try {
      const [
        usersRes,
        factsRes,
        convsRes,
        usersWithFactsRes,
        latestUserRes,
        latestFactRes,
      ] = await Promise.all([
        client.query("SELECT COUNT(*) as total FROM users"),
        client.query("SELECT COUNT(*) as total FROM profile_facts WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'"),
        client.query("SELECT COUNT(DISTINCT conv_id) as total FROM profile_facts WHERE conv_id IS NOT NULL AND email NOT LIKE '%test%' AND email NOT LIKE '%staged%'"),
        client.query("SELECT COUNT(DISTINCT email) as total FROM profile_facts WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'"),
        client.query("SELECT created_at FROM users WHERE email NOT LIKE '%test%' ORDER BY created_at DESC LIMIT 1"),
        client.query("SELECT created_at FROM profile_facts WHERE email NOT LIKE '%test%' ORDER BY created_at DESC LIMIT 1"),
      ]);

      res.json({
        totalUsers: parseInt(usersRes.rows[0].total),
        totalFacts: parseInt(factsRes.rows[0].total),
        totalConversations: parseInt(convsRes.rows[0].total),
        usersWithFacts: parseInt(usersWithFactsRes.rows[0].total),
        lastUserSignup: latestUserRes.rows[0]?.created_at || null,
        lastFactAdded: latestFactRes.rows[0]?.created_at || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // User signups by day
  app.get("/api/traction/signups", async (_req, res) => {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT DATE(created_at) as day, COUNT(*) as new_users
        FROM users
        WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'
        GROUP BY DATE(created_at)
        ORDER BY day
      `);
      // Build cumulative
      let cumulative = 0;
      const rows = r.rows.map((row: any) => {
        cumulative += parseInt(row.new_users);
        return {
          day: row.day,
          newUsers: parseInt(row.new_users),
          totalUsers: cumulative,
        };
      });
      res.json({ signups: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // Facts extracted by day
  app.get("/api/traction/facts", async (_req, res) => {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT DATE(created_at) as day, COUNT(*) as facts, COUNT(DISTINCT email) as active_users
        FROM profile_facts
        WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'
        GROUP BY DATE(created_at)
        ORDER BY day
      `);
      let cumulative = 0;
      const rows = r.rows.map((row: any) => {
        cumulative += parseInt(row.facts);
        return {
          day: row.day,
          factsAdded: parseInt(row.facts),
          totalFacts: cumulative,
          activeUsers: parseInt(row.active_users),
        };
      });
      res.json({ facts: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // Facts by category breakdown
  app.get("/api/traction/categories", async (_req, res) => {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT category, COUNT(*) as cnt
        FROM profile_facts
        WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'
        GROUP BY category
        ORDER BY cnt DESC
      `);
      res.json({ categories: r.rows.map((row: any) => ({ category: row.category, count: parseInt(row.cnt) })) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // Per-user depth (anonymized for dashboard)
  app.get("/api/traction/users", async (_req, res) => {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT u.email, u.track, u.created_at,
               COUNT(pf.id) as fact_count,
               COUNT(DISTINCT pf.conv_id) as conversation_count
        FROM users u
        LEFT JOIN profile_facts pf ON LOWER(u.email) = LOWER(pf.email)
          AND pf.email NOT LIKE '%test%' AND pf.email NOT LIKE '%staged%'
        WHERE u.email NOT LIKE '%test%' AND u.email NOT LIKE '%staged%'
        GROUP BY u.email, u.track, u.created_at
        ORDER BY fact_count DESC
      `);

      // Anonymize: show track + fact count, not email
      const users = r.rows.map((row: any, i: number) => ({
        id: i + 1,
        label: `User ${String.fromCharCode(65 + i)}`, // A, B, C...
        track: row.track || "Unknown",
        factCount: parseInt(row.fact_count),
        conversations: parseInt(row.conversation_count),
        joinedAt: row.created_at,
      }));

      res.json({ users });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // Tracks distribution
  app.get("/api/traction/tracks", async (_req, res) => {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT COALESCE(track, 'Unknown') as track, COUNT(*) as cnt
        FROM users
        WHERE email NOT LIKE '%test%' AND email NOT LIKE '%staged%'
        GROUP BY track
        ORDER BY cnt DESC
      `);
      res.json({ tracks: r.rows.map((row: any) => ({ track: row.track, count: parseInt(row.cnt) })) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  return httpServer;
}
