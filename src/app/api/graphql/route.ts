import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = process.env.MAPPED_API_KEY;

    if (!token) {
      console.error("Missing API token");
      return NextResponse.json(
        { error: "API token not configured" },
        { status: 401 }
      );
    }

    console.log("Proxying GraphQL request to Mapped.com API");

    const response = await fetch("https://api.mapped.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${token}`,
        "User-Agent": "EnergyEfficiencyApp/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`API responded with status: ${response.status}`);
      const errorText = await response.text();
      console.error("API error response:", errorText);

      return NextResponse.json(
        { error: `API request failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Successfully proxied GraphQL request");

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("GraphQL proxy error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch from GraphQL API",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
