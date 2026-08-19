import { NextResponse } from "next/server";
import { getRoutes, saveRoutes, Route } from "@/lib/data";
import { randomUUID } from "crypto";

export async function GET() {
  const routes = getRoutes();
  return NextResponse.json(routes);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { distance, name, description } = body;

    if (!distance || !name || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const routes = getRoutes();
    
    // Check if route for this distance already exists to update it, or create a new one
    // But since an admin can set multiple routes, or one per variant, 
    // the requirement "admin can set a route per distance variant" suggests updating or replacing
    // Let's replace the existing one for that distance to keep it simple, or just add.
    // Let's replace it so there's only one route per distance variant.
    
    const existingIndex = routes.findIndex((r) => r.distance === distance);
    const newRoute: Route = {
      id: existingIndex >= 0 ? routes[existingIndex].id : randomUUID(),
      distance,
      name,
      description,
    };

    if (existingIndex >= 0) {
      routes[existingIndex] = newRoute;
    } else {
      routes.push(newRoute);
    }

    saveRoutes(routes);

    return NextResponse.json({ success: true, route: newRoute }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const routes = getRoutes();
    const filteredRoutes = routes.filter(r => r.id !== id);
    saveRoutes(filteredRoutes);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
