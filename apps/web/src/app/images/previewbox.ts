{/* {showPreview && ( */}
                <div
                    className="bg-slate-800/80 border border-slate-700 rounded-xl relative overflow-hidden"
                    style={{
                        width: PREVIEW_WIDTH,
                        height: PREVIEW_HEIGHT,
                    }}
                    >
                    {/* фон для красоты */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_60%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.05),transparent_55%)]" />

                    {titleOverlayCfg && <OverlayPreviewBox cfg={titleOverlayCfg} />}
                    {subtitleOverlayCfg && <OverlayPreviewBox cfg={subtitleOverlayCfg} />}
                    {priceOverlayCfg && (
                        <OverlayPreviewBox
                        cfg={priceOverlayCfg}
                        onChangeMargins={(margins) => {
                            if (typeof margins.marginTop === "number") {
                            setPriceMarginTop(margins.marginTop);
                            }
                            if (typeof margins.marginLeft === "number") {
                            setPriceMarginLeft(margins.marginLeft);
                            }
                            if (typeof margins.marginRight === "number") {
                            setPriceMarginRight(margins.marginRight);
                            }
                            if (typeof margins.marginBottom === "number") {
                            setPriceMarginBottom(margins.marginBottom);
                            }
                        }}
                        />
                    )}
                    </div>