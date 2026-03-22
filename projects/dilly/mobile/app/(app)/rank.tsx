import { View, Text } from 'react-native';
import { colors } from '../../lib/tokens';
export default function RankScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.t2 }}>Rank</Text>
    </View>
  );
}
