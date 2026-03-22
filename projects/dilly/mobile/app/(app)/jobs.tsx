import { View, Text } from 'react-native';
import { colors } from '../../lib/tokens';
export default function JobsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.t2 }}>Get Hired</Text>
    </View>
  );
}
