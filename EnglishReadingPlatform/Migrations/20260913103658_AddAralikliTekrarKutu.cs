using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddAralikliTekrarKutu : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Kutu",
                table: "WordListItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "SonrakiTekrarAt",
                table: "WordListItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Kutu",
                table: "CumleKayitlari",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "SonrakiTekrarAt",
                table: "CumleKayitlari",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WordListItems_UserId_SonrakiTekrarAt",
                table: "WordListItems",
                columns: new[] { "UserId", "SonrakiTekrarAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CumleKayitlari_UserId_SonrakiTekrarAt",
                table: "CumleKayitlari",
                columns: new[] { "UserId", "SonrakiTekrarAt" });

            migrationBuilder.Sql(@"
                UPDATE ""WordListItems"" SET
                  ""Kutu"" = CASE WHEN ""SonCalismaAt"" IS NULL THEN 0 ELSE LEAST(GREATEST(""DogruSeri"", 1), 4) END,
                  ""SonrakiTekrarAt"" = CASE WHEN ""SonCalismaAt"" IS NULL THEN NULL ELSE now() END;
            ");

            migrationBuilder.Sql(@"
                UPDATE ""CumleKayitlari"" SET
                  ""Kutu"" = CASE WHEN ""SonCalismaAt"" IS NULL THEN 0 ELSE LEAST(GREATEST(""DogruSeri"", 1), 4) END,
                  ""SonrakiTekrarAt"" = CASE WHEN ""SonCalismaAt"" IS NULL THEN NULL ELSE now() END;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WordListItems_UserId_SonrakiTekrarAt",
                table: "WordListItems");

            migrationBuilder.DropIndex(
                name: "IX_CumleKayitlari_UserId_SonrakiTekrarAt",
                table: "CumleKayitlari");

            migrationBuilder.DropColumn(
                name: "Kutu",
                table: "WordListItems");

            migrationBuilder.DropColumn(
                name: "SonrakiTekrarAt",
                table: "WordListItems");

            migrationBuilder.DropColumn(
                name: "Kutu",
                table: "CumleKayitlari");

            migrationBuilder.DropColumn(
                name: "SonrakiTekrarAt",
                table: "CumleKayitlari");
        }
    }
}
