import { NextResponse } from 'next/server';

export function withCORS(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    // Manejar preflight requests (OPTIONS)
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Ejecutar el handler
    const response = await handler(req);

    // Agregar headers CORS a la respuesta
    const corsResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    corsResponse.headers.set('Access-Control-Allow-Origin', '*');
    corsResponse.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS, PATCH'
    );
    corsResponse.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    return corsResponse;
  };
}
