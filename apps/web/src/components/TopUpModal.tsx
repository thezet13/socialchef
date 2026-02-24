export default function TopUpModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const packs = [
    { credits: 200, price: "$19" },
    { credits: 500, price: "$55" },
    { credits: 1000, price: "$110" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 w-full max-w-lg">
        <div className="text-lg font-semibold">Add credits</div>

        <div className="mt-6 space-y-4">
          {packs.map((p) => (
            <div
              key={p.credits}
              className="border border-slate-800 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold"><span className="text-orange-500">{p.credits}</span> credits</div>
                <div className="text-sm text-slate-400">
                  {p.price} one-time payment
                </div>
              </div>

              <button className="bg-blue-500/50 hover:bg-blue-500/70 px-4 py-2 rounded-md">
                Buy
              </button>
            </div>
          ))}
        </div>

        <div className="w-full flex justify-center"><button
          onClick={onClose}
          className="mt-6 border border-slate-800 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800"
        >
          Close
        </button>
        </div>
      </div>
    </div>
  );
}
