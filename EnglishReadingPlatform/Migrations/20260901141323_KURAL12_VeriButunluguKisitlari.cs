using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class KURAL12_VeriButunluguKisitlari : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Groups_Users_AdminUserId",
                table: "Groups");

            migrationBuilder.DropIndex(
                name: "IX_WordListItems_UserId",
                table: "WordListItems");

            migrationBuilder.DropIndex(
                name: "IX_UserActivityLogs_UserId",
                table: "UserActivityLogs");

            migrationBuilder.DropIndex(
                name: "IX_TranslationCaches_QueryText_ContextText",
                table: "TranslationCaches");

            migrationBuilder.DropIndex(
                name: "IX_ReadingProgresses_UserId",
                table: "ReadingProgresses");

            migrationBuilder.DropIndex(
                name: "IX_Quizzes_ChapterId",
                table: "Quizzes");

            migrationBuilder.DropIndex(
                name: "IX_GroupMembers_GroupId",
                table: "GroupMembers");

            migrationBuilder.DropIndex(
                name: "IX_GroupBookAssignments_GroupId",
                table: "GroupBookAssignments");

            migrationBuilder.DropIndex(
                name: "IX_BookPages_BookId",
                table: "BookPages");

            migrationBuilder.CreateIndex(
                name: "IX_WordListItems_UserId_Word",
                table: "WordListItems",
                columns: new[] { "UserId", "Word" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserActivityLogs_Timestamp",
                table: "UserActivityLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_UserActivityLogs_UserId_ActivityType_Timestamp",
                table: "UserActivityLogs",
                columns: new[] { "UserId", "ActivityType", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_TranslationCaches_CreatedAt",
                table: "TranslationCaches",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TranslationCaches_QueryText_ContextText",
                table: "TranslationCaches",
                columns: new[] { "QueryText", "ContextText" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SifreSifirlamaJetonlari_CreatedAt",
                table: "SifreSifirlamaJetonlari",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ReadingProgresses_UserId_BookId",
                table: "ReadingProgresses",
                columns: new[] { "UserId", "BookId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Quizzes_ChapterId",
                table: "Quizzes",
                column: "ChapterId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GroupMembers_GroupId_UserId",
                table: "GroupMembers",
                columns: new[] { "GroupId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GroupBookAssignments_GroupId_BookId",
                table: "GroupBookAssignments",
                columns: new[] { "GroupId", "BookId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookPages_BookId_PageNumber",
                table: "BookPages",
                columns: new[] { "BookId", "PageNumber" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Groups_Users_AdminUserId",
                table: "Groups",
                column: "AdminUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Groups_Users_AdminUserId",
                table: "Groups");

            migrationBuilder.DropIndex(
                name: "IX_WordListItems_UserId_Word",
                table: "WordListItems");

            migrationBuilder.DropIndex(
                name: "IX_UserActivityLogs_Timestamp",
                table: "UserActivityLogs");

            migrationBuilder.DropIndex(
                name: "IX_UserActivityLogs_UserId_ActivityType_Timestamp",
                table: "UserActivityLogs");

            migrationBuilder.DropIndex(
                name: "IX_TranslationCaches_CreatedAt",
                table: "TranslationCaches");

            migrationBuilder.DropIndex(
                name: "IX_TranslationCaches_QueryText_ContextText",
                table: "TranslationCaches");

            migrationBuilder.DropIndex(
                name: "IX_SifreSifirlamaJetonlari_CreatedAt",
                table: "SifreSifirlamaJetonlari");

            migrationBuilder.DropIndex(
                name: "IX_ReadingProgresses_UserId_BookId",
                table: "ReadingProgresses");

            migrationBuilder.DropIndex(
                name: "IX_Quizzes_ChapterId",
                table: "Quizzes");

            migrationBuilder.DropIndex(
                name: "IX_GroupMembers_GroupId_UserId",
                table: "GroupMembers");

            migrationBuilder.DropIndex(
                name: "IX_GroupBookAssignments_GroupId_BookId",
                table: "GroupBookAssignments");

            migrationBuilder.DropIndex(
                name: "IX_BookPages_BookId_PageNumber",
                table: "BookPages");

            migrationBuilder.CreateIndex(
                name: "IX_WordListItems_UserId",
                table: "WordListItems",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserActivityLogs_UserId",
                table: "UserActivityLogs",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TranslationCaches_QueryText_ContextText",
                table: "TranslationCaches",
                columns: new[] { "QueryText", "ContextText" });

            migrationBuilder.CreateIndex(
                name: "IX_ReadingProgresses_UserId",
                table: "ReadingProgresses",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Quizzes_ChapterId",
                table: "Quizzes",
                column: "ChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupMembers_GroupId",
                table: "GroupMembers",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupBookAssignments_GroupId",
                table: "GroupBookAssignments",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_BookPages_BookId",
                table: "BookPages",
                column: "BookId");

            migrationBuilder.AddForeignKey(
                name: "FK_Groups_Users_AdminUserId",
                table: "Groups",
                column: "AdminUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
