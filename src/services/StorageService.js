import AsyncStorage from '@react-native-async-storage/async-storage';

const ROUTES_KEY = '@gridlock_routes';

export async function getRoutes() {
  try {
    const json = await AsyncStorage.getItem(ROUTES_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function saveRoute(route) {
  try {
    const routes = await getRoutes();
    const idx = routes.findIndex((r) => r.id === route.id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      routes[idx] = { ...route, updatedAt: now };
    } else {
      routes.push({ ...route, createdAt: now, updatedAt: now });
    }
    await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
    return true;
  } catch {
    return false;
  }
}

export async function deleteRoute(routeId) {
  try {
    const routes = await getRoutes();
    await AsyncStorage.setItem(
      ROUTES_KEY,
      JSON.stringify(routes.filter((r) => r.id !== routeId))
    );
    return true;
  } catch {
    return false;
  }
}
