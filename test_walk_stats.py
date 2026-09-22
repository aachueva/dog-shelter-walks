import unittest
from datetime import date
import io
import zipfile

from walk_stats import (
    build_dashboard,
    parse_current_dogs_csv,
    parse_current_dogs_xlsx,
    parse_walk_csv,
)


class WalkStatsTests(unittest.TestCase):
    def test_sharepoint_roster_filters_dob_and_strips_tag_numbers(self):
        shared_strings = [
            "Dog Name/Tag Number",
            "Location",
            "Aspen 008802",
            "dog over breed",
            "Pixie 008816",
            "dob as of 8/29",
            "Puck 008815",
            "dog over breed as of 8/29",
            "Auspicious 008920",
            "country view kennel",
            "Jax 008661",
            "adopted",
        ]
        strings_xml = "".join(f"<si><t>{value}</t></si>" for value in shared_strings)
        rows_xml = "".join(
            f'<row r="{row}"><c r="C{row}" t="s"><v>{name}</v></c>'
            f'<c r="F{row}" t="s"><v>{location}</v></c></row>'
            for row, (name, location) in enumerate(
                [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)], start=1
            )
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "xl/sharedStrings.xml",
                f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{strings_xml}</sst>',
            )
            archive.writestr(
                "xl/workbook.xml",
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
            )
            archive.writestr(
                "xl/_rels/workbook.xml.rels",
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Target="worksheets/sheet1.xml" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>'
                "</Relationships>",
            )
            archive.writestr(
                "xl/worksheets/sheet1.xml",
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f"<sheetData>{rows_xml}</sheetData></worksheet>",
            )
        roster = buffer.getvalue()
        dogs = parse_current_dogs_xlsx(roster)
        self.assertIn("Aspen", dogs)
        self.assertIn("Pixie", dogs)
        self.assertIn("Puck", dogs)
        self.assertNotIn("Auspicious", dogs)
        self.assertNotIn("Jax", dogs)
        self.assertTrue(all(not dog.endswith("008802") for dog in dogs))

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
        self.assertEqual(
            [dog["dog"] for dog in payload["priorityDogs"]],
            ["Pixie", "Puck", "Duke", "Blue"],
        )
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

    def test_priority_limit_expands_to_include_activity_ties(self):
        walks = parse_walk_csv(
            "Dog Name,Date of Walk\n"
            "Aspen,2026-08-20\n"
            "Rufus,2026-08-20\n"
            "Blanca,2026-08-30\n"
        )
        payload = build_dashboard(
            walks,
            ["Pixie", "Puck", "Aspen", "Rufus", "Blanca"],
            today=date(2026, 9, 17),
            priority_count=3,
        )
        self.assertEqual(
            [dog["dog"] for dog in payload["priorityDogs"]],
            ["Pixie", "Puck", "Aspen", "Rufus", "Blanca"],
        )


if __name__ == "__main__":
    unittest.main()
