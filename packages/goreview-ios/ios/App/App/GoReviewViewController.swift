import Capacitor

final class GoReviewViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GoReviewNativePlugin())
    }
}
