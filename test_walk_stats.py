import unittest
from datetime import date

from walk_stats import build_dashboard, parse_current_dogs_csv, parse_walk_csv


class WalkStatsTests(unittest.TestCase):
    def test_current_dogs_are_trimmed_and_deduplicated(self):
        result = parse_current_dogs_csv("Dog Name\n Frankie Avalon \nPIXIE\nPixie\n")
        self.assertEqual(result, ["Frankie Avalon", "PIXIE"])

    def test_wide_matrix_parses_first_row_as_data(self):
        walks = parse_walk_csv(
            "Frankie Avalon,Sep 13,Sep 5\nPixie,,\n",
            reference=date(2026, 9, 17),
        )
        self.assertEqual(len(walks), 2)
        self.assertEqual(walks[0].dog, "Frankie Avalon")
        self.assertEqual(walks[0].walk_date, date(2026, 9, 13))

    def test_priority_includes_zero_history_and_excludes_former_dogs(self):
        walks = parse_walk_csv(
            "Dog Name,Date of Walk\n"
            "Blue,2026-09-16\n"
            "Duke,2026-09-15\n"
            "Former Dog,2026-09-17\n"
        )
        payload = build_dashboard(
            walks,
            [" Blue ", "Duke", "Pixie", "Puck"],
            today=date(2026, 9, 17),
            priority_count=3,
        )
        self.assertEqual([dog["dog"] for dog in payload["priorityDogs"]], ["Pixie", "Puck", "Duke"])
        self.assertNotIn("Former Dog", [dog["dog"] for dog in payload["dogs"]])
        self.assertEqual(payload["summary"]["totalDogs"], 4)

    def test_dog_walked_today_moves_below_unwalked_dogs(self):
        walks = parse_walk_csv(
            "Dog Name,Date of Walk\nBlue,2026-09-17\nDuke,2026-09-16\n"
        )
        payload = build_dashboard(
            walks, ["Blue", "Duke"], today=date(2026, 9, 17), priority_count=1
        )
        self.assertEqual(payload["priorityDogs"][0]["dog"], "Duke")
        self.assertTrue(next(dog for dog in payload["dogs"] if dog["dog"] == "Blue")["walkedToday"])


if __name__ == "__main__":
    unittest.main()
