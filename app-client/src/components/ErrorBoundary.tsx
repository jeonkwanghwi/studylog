import { Component, type ReactNode } from "react";
import { View } from "react-native";

import { Button } from "../design/Button";
import { T } from "../design/Text";
import { space } from "../design/tokens";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: space.xl, gap: space.md }}>
        <T variant="title">문제가 발생했습니다</T>
        <T variant="body" kind="sub">
          {this.state.error.message}
        </T>
        <Button label="다시 시도" tone="secondary" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
