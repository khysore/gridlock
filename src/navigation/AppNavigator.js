import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import EditRouteScreen from '../screens/EditRouteScreen';
import RideScreen from '../screens/RideScreen';
import COLORS from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'GridLock' }}
      />
      <Stack.Screen
        name="EditRoute"
        component={EditRouteScreen}
        options={{ title: 'Edit Route' }}
      />
      <Stack.Screen
        name="Ride"
        component={RideScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
