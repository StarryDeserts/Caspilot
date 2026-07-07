import { IntentDetailClientPage } from './client-page.js';

export default async function IntentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IntentDetailClientPage id={id} />;
}
