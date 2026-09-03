export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers,
      });
    }

    try {
      // =========================================================
      // HOME
      // =========================================================
      if (url.pathname === "/" && request.method === "GET") {
        return jsonResponse(
          {
            ok: true,
            service: "Anton Memory API",
            version: "1.0",
            endpoints: [
              "GET /",
              "GET /health",
              "GET /cases",
              "GET /cases/:id",
              "GET /cases/search?q=search-term",
              "POST /cases",
            ],
          },
          200,
          headers
        );
      }

      // =========================================================
      // HEALTH CHECK
      // =========================================================
      if (url.pathname === "/health" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM case_library"
        ).first();

        return jsonResponse(
          {
            ok: true,
            service: "Anton Memory API",
            database: "connected",
            cases: result?.count ?? 0,
          },
          200,
          headers
        );
      }

      // =========================================================
      // SEARCH CASES
      // =========================================================
      if (url.pathname === "/cases/search" && request.method === "GET") {
        const q = url.searchParams.get("q")?.trim();

        if (!q) {
          return jsonResponse(
            {
              ok: false,
              error: "Search parameter q is required",
            },
            400,
            headers
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
             OR test_data LIKE ?
             OR root_cause LIKE ?
             OR recommended_repair LIKE ?
             OR oem_parts LIKE ?
             OR customer_explanation LIKE ?
             OR status LIKE ?
             OR source LIKE ?
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
            search,
            search,
            search,
            search,
            search
          )
          .all();

        return jsonResponse(
          {
            ok: true,
            query: q,
            count: results.results?.length ?? 0,
            cases: results.results ?? [],
          },
          200,
          headers
        );
      }

      // =========================================================
      // GET ALL CASES
      // =========================================================
      if (url.pathname === "/cases" && request.method === "GET") {
        const requestedLimit = parseInt(
          url.searchParams.get("limit") || "100",
          10
        );

        const limit = Math.min(
          Math.max(
            Number.isNaN(requestedLimit) ? 100 : requestedLimit,
            1
          ),
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

        return jsonResponse(
          {
            ok: true,
            count: results.results?.length ?? 0,
            cases: results.results ?? [],
          },
          200,
          headers
        );
      }

      // =========================================================
      // GET ONE CASE
      // =========================================================
      if (
        url.pathname.startsWith("/cases/") &&
        request.method === "GET"
      ) {
        const id = url.pathname.split("/")[2];

        if (!id) {
          return jsonResponse(
            {
              ok: false,
              error: "Case ID is required",
            },
            400,
            headers
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
          return jsonResponse(
            {
              ok: false,
              error: "Case not found",
            },
            404,
            headers
          );
        }

        return jsonResponse(
          {
            ok: true,
            case: result,
          },
          200,
          headers
        );
      }

      // =========================================================
      // SAVE NEW CASE
      // =========================================================
      if (url.pathname === "/cases" && request.method === "POST") {
        let body;

        try {
          body = await request.json();
        } catch {
          return jsonResponse(
            {
              ok: false,
              error: "Request body must be valid JSON",
            },
            400,
            headers
          );
        }

        if (!body.complaint || !String(body.complaint).trim()) {
          return jsonResponse(
            {
              ok: false,
              error: "complaint is required",
            },
            400,
            headers
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
            valueOrNull(body.appliance_type),
            valueOrNull(body.brand),
            valueOrNull(body.model_number),
            valueOrNull(body.serial_number),
            String(body.complaint).trim(),
            valueOrNull(body.error_codes),
            valueOrNull(body.observations),
            valueOrNull(body.test_data),
            valueOrNull(body.root_cause),
            valueOrNull(body.confidence),
            valueOrNull(body.recommended_repair),
            valueOrNull(body.oem_parts),
            valueOrNull(body.customer_explanation),
            valueOrDefault(body.status, "completed"),
            valueOrDefault(body.source, "anton")
          )
          .run();

        return jsonResponse(
          {
            ok: true,
            message: "Case saved to Anton memory",
            id: result.meta?.last_row_id ?? null,
          },
          201,
          headers
        );
      }

      // =========================================================
      // ROUTE NOT FOUND
      // =========================================================
      return jsonResponse(
        {
          ok: false,
          error: "Route not found",
        },
        404,
        headers
      );
    } catch (error) {
      console.error("Anton Memory API error:", error);

      return jsonResponse(
        {
          ok: false,
          error: error?.message || "Internal server error",
        },
        500,
        headers
      );
    }
  },
};


// =============================================================
// HELPERS
// =============================================================

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}


function valueOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}


function valueOrDefault(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return value;
}
