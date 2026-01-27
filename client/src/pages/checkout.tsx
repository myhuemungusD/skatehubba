import { CreditCard } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function Checkout() {
  return (
    <ComingSoon
      title="Checkout"
      description="Secure payments and checkout functionality. Payment processing coming soon."
      icon={
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
          <CreditCard className="w-10 h-10 text-orange-500" />
        </div>
      }
    />
  );
}
