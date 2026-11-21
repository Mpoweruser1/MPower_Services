import os, sys, tempfile, unittest, io, contextlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fno

CSV = """Symbol,Trade Date,Segment,Position Type,Open Quantity,Open Average,Open Value,Previous Close Price
XYZ26DECFUT,2026-11-20,FO,sell,1000,100,-100000,101
XYZ26DEC100CE,2026-11-20,FO,buy,5000,4,20000,4.5
ABC26NOV50PE,2026-11-20,FO,buy,100,2,200,0.5
"""


class T(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w") as fh:
            fh.write(CSV)

    def tearDown(self):
        os.remove(self.path)

    def test_parse(self):
        l = fno.parse_symbol("ASHOKLEY26DEC165CE")
        self.assertEqual((l["underlying"], l["kind"], l["strike"], l["expiry"]), ("ASHOKLEY", "CE", 165.0, "2026-12-29"))
        self.assertEqual(fno.parse_symbol("MIDCPNIFTY26DECFUT")["kind"], "FUT")
        w = fno.parse_symbol("NIFTY2611320000CE")
        self.assertEqual((w["underlying"], w["strike"], w["expiry"]), ("NIFTY", 20000.0, "2026-01-13"))
        self.assertIsNone(fno.parse_symbol("INFY"))

    def test_expiry_payoff_and_breakeven(self):
        legs, as_of = fno.read_positions(self.path)
        xyz = [l for l in legs if l["underlying"] == "XYZ"]
        # short 1000 fut @100 + long 5000 100CE @4: at 100 -> -20000; at 110 -> -10000 + 50000 - 20000
        self.assertAlmostEqual(fno.expiry_pnl(xyz, 100), -20000)
        self.assertAlmostEqual(fno.expiry_pnl(xyz, 110), 20000)
        self.assertEqual(fno.breakevens(xyz, 70, 130), [80.0, 105.0])
        self.assertEqual(fno.tail_slopes(xyz), (-1000, 4000))

    def test_black76_and_iv_roundtrip(self):
        p = fno.black76("CE", 100, 100, 0.1, 0.3)
        self.assertAlmostEqual(fno.implied_vol("CE", p, 100, 100, 0.1), 0.3, places=4)
        c, put = fno.black76("CE", 100, 95, 0.2, 0.25), fno.black76("PE", 100, 95, 0.2, 0.25)
        self.assertAlmostEqual(c - put, (100 - 95) * fno.math.exp(-fno.RATE * 0.2), places=6)

    def test_report_runs_and_warns(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = fno.main(["report", self.path, "--as-of", "2026-11-20", "--price", "ABC=48"])
        out = buf.getvalue()
        self.assertEqual(rc, 0)
        self.assertIn("ABC26NOV50PE expires in 4 days", out)
        self.assertIn("lost 75%", out)
        self.assertIn("you gain if the price RISES", out)

    def test_indian_grouping(self):
        self.assertEqual(fno.rs(1234567), "₹12,34,567")
        self.assertEqual(fno.signed(-170800), "-₹1,70,800")


if __name__ == "__main__":
    unittest.main()
