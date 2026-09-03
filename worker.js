export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      // HEALTH CHECK
      if (url.pathname === "/health" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM case_library"
        ).first();

        return new Response(
          JSON.stringify({
            ok: true,
            service: "Anton Memory API",
            database: "connected",
            cases: result?.count ?? 0,
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      // GET ALL CASES
      if (url.pathname === "/cases" && request.method === "GET") {
        const limit = Math.min(
          Math.max(parseInt(url.searchParams.get("limit") || "100"), 1),
          500
        );

        const results = await env.DB.prepare(
          `
          SELECT *
          FROM case_library
          ORDER BY id DESC
          LIMIT ?
          `
        )
          .bind(limit)
          .all();

        return new Response(
          JSON.stringify({
            ok: true,
            count: results.results.length,
            cases: results.results,
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      // SEARCH CASES
      if (url.pathname === "/cases/search" && request.method === "GET") {
        const q = url.searchParams.get("q");

        if (!q) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Search parameter q is required",
            }),
            {
              status: 400,
              headers,
            }
          );
        }

        const search = `%${q}%`;

        const results = await env.DB.prepare(
          `
          SELECT *
          FROM case_library
          WHERE appliance_type LIKE ?
             OR brand LIKE ?
             OR model_number LIKE ?
             OR serial_number LIKE ?
             OR complaint LIKE ?
             OR error_codes LIKE ?
             OR observations LIKE ?
             OR root_cause LIKE ?
             OR recommended_repair LIKE ?
             OR oem_parts LIKE ?
          ORDER BY id DESC
          LIMIT 100
          `
        )
          .bind(
            search,
            search,
            search,
            search,
            search,
            search,
            search,
            search,
            search,
            search
          )
          .all();

        return new Response(
          JSON.stringify({
            ok: true,
            query: q,
            count: results.results.length,
            cases: results.results,
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      // GET ONE CASE
      if (
        url.pathname.startsWith("/cases/") &&
        request.method === "GET"
      ) {
        const id = url.pathname.split("/")[2];

        if (!id) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Case ID is required",
            }),
            {
              status: 400,
              headers,
            }
          );
        }

        const result = await env.DB.prepare(
          `
          SELECT *
          FROM case_library
          WHERE id = ?
          `
        )
          .bind(id)
          .first();

        if (!result) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Case not found",
            }),
            {
              status: 404,
              headers,
            }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            case: result,
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      // SAVE NEW CASE
      if (url.pathname === "/cases" && request.method === "POST") {
        const body = await request.json();

        if (!body.complaint) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "complaint is required",
            }),
            {
              status: 400,
              headers,
            }
          );
        }

        const result = await env.DB.prepare(
          `
          INSERT INTO case_library (
            appliance_type,
            brand,
            model_number,
            serial_number,
            complaint,
            error_codes,
            observations,
            test_data,
            root_cause,
            confidence,
            recommended_repair,
            oem_parts,
            customer_explanation,
            status,
            source
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
          .bind(
            body.appliance_type ?? null,
            body.brand ?? null,
            body.model_number ?? null,
            body.serial_number ?? null,
            body.complaint,
            body.error_codes ?? null,
            body.observations ?? null,
            body.test_data ?? null,
            body.root_cause ?? null,
            body.confidence ?? null,
            body.recommended_repair ?? null,
            body.oem_parts ?? null,
            body.customer_explanation ?? null,
            body.status ?? "completed",
            body.source ?? "anton"
          )
          .run();

        return new Response(
          JSON.stringify({
            ok: true,
            message: "Case saved to Anton memory",
            id: result.meta?.last_row_id ?? null,
          }),
          {
            status: 201,
            headers,
          }
        );
      }

      // HOME
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "Anton Memory API",
            endpoints: [
              "GET /health",
              "GET /cases",
              "GET /cases/:id",
              "GET /cases/search?q=search-term",
              "POST /cases",
            ],
          }),
          {
            status: 200,
            headers,
          }
        );
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Route not found",
        }),
        {
          status: 404,
          headers,
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error.message,
        }),
        {
          status: 500,
          headers,
        }
      );
    }
  },
};
