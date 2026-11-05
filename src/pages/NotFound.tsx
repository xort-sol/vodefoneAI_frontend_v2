import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  const nav = useNavigate();
  return <div className="card mt-24"><EmptyState icon={<Compass size={18} />} title="Page not found" desc="The page you’re looking for doesn’t exist or has moved." action={<Button variant="primary" onClick={() => nav('/')}>Back to overview</Button>} /></div>;
}
