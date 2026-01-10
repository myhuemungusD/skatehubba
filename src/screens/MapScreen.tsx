import React from 'react';
import { View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { useAddSpotStore } from '../stores/addSpotStore';
import { AddSpotModal } from '../components/AddSpotModal';

export const MapScreen = () => {
  const { isPinningMode, setTempCoordinates, tempCoordinates } = useAddSpotStore();

  // FIX #3: Strict Typing & Defensive Check
  const handleMapPress = (e: Mapbox.OnPressEvent) => {
    if (!isPinningMode) return;

    const coords = e.geometry?.coordinates;

    // Guard against bad payloads
    if (!Array.isArray(coords) || coords.length !== 2) return;

    setTempCoordinates(coords as [number, number]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Mapbox.MapView
        style={{ flex: 1 }}
        onPress={handleMapPress}
        pitchEnabled={!isPinningMode}
        rotateEnabled={!isPinningMode}
      >
        <Mapbox.Camera followUserLocation />

        {tempCoordinates && (
          <Mapbox.PointAnnotation id="new-spot-pin" coordinate={tempCoordinates}>
            <View
              style={{
                width: 30,
                height: 30,
                backgroundColor: '#FF0000',
                borderRadius: 15,
                borderWidth: 2,
                borderColor: 'white',
              }}
            />
          </Mapbox.PointAnnotation>
        )}
      </Mapbox.MapView>

      <AddSpotModal />
    </View>
  );
};
