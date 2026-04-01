type PanelProps = {
  actions: Array<{ id: string; label: string }>;
  title: string;
};

export type ExpandedPanelProps = PanelProps;

const props: PanelProps = {
  actions: [{ id: 'refresh', label: 'Refresh' }],
  title: 'Overview',
};

export const panel = <section role="region">{props.title}</section>;
